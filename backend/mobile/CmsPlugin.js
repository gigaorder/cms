const path = require('path');
const dirTree = require('directory-tree');
const fileHelper = require('./files.helper');
const axios = require('axios').default;
const cms = require('../src/cms');
const fs = require('fs');
const _ = require('lodash');

class CmsPlugin {

  static initAllPlugin(paths = 'plugins', plugins) {
    const dirPath = path.join(__dirname, paths);
    const dirContent = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(item => fs.statSync(path.join(dirPath, item)).isDirectory());
    let result = dirContent.reduce((acc, item) => {
      if (!Array.isArray(plugins) || !plugins.length > 0 || plugins.includes(item)) {
        return Object.assign(acc, { [item]: new CmsPlugin(path.join(dirPath, item)) });
      }
      return acc;
    }, {});

    return result;
    // return {
    //   testPlugin: new ClassPluginTest('test-plugin'),
    //   corePlugin: new ClassPluginTest('core-plugin')
    // };
  }

  static getAllPlugin() {
    const dirPath = path.join(__dirname, 'plugins');
    const dirContent = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(item => fs.statSync(path.join(dirPath, item)).isDirectory());
    return dirContent;
  }

  static convertInternalPathToFilePathStatic(internalPath, pluginName) {
    const pluginPath = path.join(__dirname, 'plugins', pluginName);
    return path.join(pluginPath, internalPath);
  }

  static convertFilePathToInternalPathStatic(_filePath, pluginName) {
    const pluginPath = path.join(__dirname, 'plugins', pluginName);
    return path.relative(pluginPath, _filePath);
  }

  constructor(pluginPath, pluginName, resolveUrlPath) {
    //this.pluginPath = path.join(name);
    this.pluginPath = pluginPath;
    this.pluginName = pluginName ? pluginName : path.basename(pluginPath);
    if (resolveUrlPath) {
      this.resolveUrlPath = resolveUrlPath;
    }
    this.onEachRead = this.onEachRead.bind(this);
  }

  resolveUrlPath(internalPath) {
    const pluginsFolderPath = path.join(path.dirname(this.pluginPath), '../');
    return path.relative(pluginsFolderPath, internalPath);
  };

  onEachRead(item) {
    item.url = this.resolveUrlPath(item.path);
    item.path = this.convertFilePathToInternalPath(item.path);
    item.pluginName = this.pluginName;
  }

  convertFilePathToInternalPath(_filePath) {
    return CmsPlugin.convertFilePathToInternalPathStatic(_filePath, this.pluginName);
  }

  convertInternalPathToFilePath(internalPath) {
    return CmsPlugin.convertInternalPathToFilePathStatic(internalPath, this.pluginName);
  }

  loadDirTree(internalPath = '', options, onEachFile = this.onEachRead) {
    const dirPath = this.convertInternalPathToFilePath(internalPath);
    const tree = dirTree(dirPath, {
      exclude: [{ test: (filePath) => /^\.|node_modules/.test(path.basename(filePath)) }],
      ...options
    }, onEachFile, onEachFile);
    return tree;
  }

  loadModules(internalPath) {
    const pathToModules = this.convertInternalPathToFilePath(internalPath);
    if (!fileHelper.existsSync(pathToModules)) {
      return [];
    }
    const dir = fileHelper.readDir(pathToModules);
    const pathToMap = dir
      .filter(item => {
        // remove all item which is not file
        const itemPluginPath = path.join(internalPath, item);
        return fs.statSync(this.convertInternalPathToFilePath(itemPluginPath)).isFile();
      })
      .map(item => {
        const name = item.split('.');
        name.pop();
        const modulePath = path.join(this.pluginPath, internalPath, item);
        return {
          name: item,
          module: path.basename(item),
          url: this.resolveUrlPath(modulePath)
        };
      });
    return pathToMap;
  }

  addUnpkgModules(name, type = 'modules') {
    return new Promise((resolve, reject) => {
      axios.get(`https://unpkg.com/${name}`)
        .then(response => {
          let moduleDirectory = this.convertInternalPathToFilePath(type);
          fileHelper.addNew(path.join(moduleDirectory, `${name}.js`), response.data);
          resolve();
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  removeFile(_path) {
    fileHelper.delete(this.convertInternalPathToFilePath(_path));
  }

  renameFile(oldPath, newName) {
    fileHelper.rename(this.convertInternalPathToFilePath(oldPath), newName);
  }

  copyFile(oldPath, newPath, options = { type: 'copy', toPlugin: '' }) {
    fileHelper.copyFile(this.convertInternalPathToFilePath(oldPath), CmsPlugin.convertInternalPathToFilePathStatic(newPath, options.toPlugin), options);
  }

  exportModel(name, content, collection, internalFilePath) {
    const writePath = path.join(internalFilePath, `/${name}.${collection}.json`);
    fileHelper.addNew(this.convertInternalPathToFilePath(writePath), JSON.stringify(content, null, 2));
  }

  async importModel(collection, filePath, replace = false) {
    const content = fileHelper.readFile(this.convertInternalPathToFilePath(filePath), 'utf-8');
    if (replace) {
      const document = JSON.parse(content);
      const { _id, ...other } = document;
      return await cms.getModel(collection).findOneAndUpdate({ _id: _id }, document, { upsert: true, new: true });
    }
    return await cms.getModel(collection).create(JSON.parse(content));
  }

  addNewFile(internalPath, content, type) {
    fileHelper.addNew(this.convertInternalPathToFilePath(internalPath), content, type);
  }

  reexportModel(_path, fileName) {
    const filePath = this.convertInternalPathToFilePath(_path);
    const directoryPath = path.dirname(_path);
    const content = fileHelper.readFile(filePath);
    const { _id } = JSON.parse(content);
    const [documentName, collectionName] = fileName.split('.');
    const Model = cms.getModel(collectionName);
    return new Promise((resolve, reject) => {
      Model.findById(_id)
        .then(item => {
          if (item) {
            this.exportModel(documentName, item.toObject(), collectionName, directoryPath);
            resolve();
          } else {
            reject('non exist in db');
          }
        })
        .catch(err => {
          reject(err);
        });
    });

  }

}

module.exports = CmsPlugin;
