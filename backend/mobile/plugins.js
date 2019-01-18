const dirTree = require('directory-tree');
const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');
const axios = require('axios').default;

function findFileItem(directoryTree) {
  return directoryTree && directoryTree.children.map(item => {
    return {
      name: item.name.replace(item.extension, ''),
      content: fs.readFileSync(item.path, 'utf-8')
    };
  });
}

function isFileWithExtension(name, extensions) {
  if (name.length < extensions.length) {
    return false;
  }
  return name.indexOf(`.${extensions}`) === name.length - extensions.length - 1;
}

function onEachRead(item) {
  item.path = path.relative(path.join(__dirname, './plugins'), item.path);
}

function copyOrMoveFile(filePath, destPath, type) {
  // const moduleDirectory = path.join(__dirname, );
  const relative = path.relative('', destPath);
  if (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    const oldUrl = path.join(__dirname, './plugins', filePath);
    const newURl = path.join(__dirname, './plugins', destPath);
    if (type === 'move') {
      fsExtra.moveSync(oldUrl, newURl);
    } else {
      fsExtra.copySync(oldUrl, newURl);

    }
  } else {
    // Not in plugin folder
    throw { message: 'Cannot copy file here' };
  }
}

module.exports = (cms) => {
  cms.io.on('connection', function (socket) {
    socket.on('loadPlugin', function (fn) {
      const tree = dirTree(path.join(__dirname, './plugins'), {
        exclude: [{ test: (filePath) => /^\./.test(path.basename(filePath)) }]
      }, onEachRead, onEachRead);
      console.log(tree);
      fn(tree ? tree.children : []);
    });
    socket.on('save', function (url, content, fn) {
      try {
        const relativeUrl = path.join(__dirname, './public', url);
        fs.writeFileSync(relativeUrl, content, 'utf-8');
        fn();
      } catch (e) {
        fn(e.stack);
      }
    });
    socket.on('compile', function (url, content, fn) {
      try {
        const relativeUrl = path.join(__dirname, url);
        const writeUrl = path.join(path.dirname(relativeUrl), 'dist', path.basename(relativeUrl));
        const distDirectory = path.join(path.dirname(relativeUrl), 'dist');
        if (!fs.existsSync(distDirectory)) {
          fs.mkdirSync(distDirectory);
        }
        fs.writeFileSync(writeUrl, content, 'utf-8');
        fn();
      } catch (e) {
        fn(e);
      }
    });
    socket.on('loadDistPlugin', function (fn) {
      const pathToModules = path.join(__dirname, './plugins/test-plugins/modules');
      let modules = [];
      if (fs.existsSync(pathToModules)) {
        const dir = fs.readdirSync(pathToModules);
        modules = dir.map(item => {
          const name = item.split('.');
          name.pop();
          return {
            name: item,
            module: name.join('.'),
            url: 'test-plugins/modules/' + item
          };
        });
      }
      const pathToComponent = path.join(__dirname, './plugins/test-plugins/components');
      let components = [];
      if (fs.existsSync(pathToComponent)) {
        const dir = fs.readdirSync(pathToComponent);
        components = dir.map(item => {
          const name = item.split('.');
          name.pop();
          return {
            name: item,
            module: name.join('.'),
            url: 'test-plugins/components/' + item
          };
        });
      }
      const tree = dirTree(path.join(__dirname, './plugins/test-plugins/dist'), {});
      const plugins = findFileItem(tree);
      fn({ plugins: plugins, modules: modules, components: components });
    });
    socket.on('delete', function (url, fn) {
      try {
        const relativeUrl = path.join(__dirname, './plugins', url);
        const isDir = fs.statSync(relativeUrl).isDirectory();
        if (!isDir) {
          fs.unlinkSync(relativeUrl);
          fn();
        } else {
          fs.rmdirSync(relativeUrl);
          fn();
        }
      } catch (e) {
        fn(Object.assign({}, e, { message: 'Cannot delete folder with files' }));
      }
    });
    socket.on('rename', function (url, newName, fn) {
      try {
        const oldUrl = path.join(__dirname, './plugins', url);
        const newUrl = path.join(__dirname, './plugins', url, '../', `/${newName}`);
        fs.renameSync(oldUrl, newUrl);
        fn();
      } catch (e) {
        fn(e);
      }
    });
    socket.on('addNew', function (fileName, type, fn) {
      try {
        const newUrl = path.join(__dirname, './plugins', fileName);
        if (type === 'file') {
          fs.writeFileSync(newUrl, '', 'utf-8');
        } else {
          fs.mkdirSync(newUrl);
        }
        fn();
      } catch (e) {
        fn(e);
      }
    });
    socket.on('loadModules', function (fn) {

      const pathToModules = path.join(__dirname, './plugins/test-plugins/modules');
      if (!fs.existsSync(pathToModules)) {
        return fn([]);
      }
      const dir = fs.readdirSync(pathToModules);
      const pathToMap = dir.map(item => {
        const name = item.split('.');
        name.pop();
        return {
          name: item,
          module: name.join('.'),
          url: 'test-plugins/modules/' + item
        };
      });
      fn(pathToMap);
    });
    socket.on('addModules', function (name, fn) {
      axios.get(`https://unpkg.com/${name}`)
           .then(response => {
             const moduleDirectory = path.join(__dirname, './plugins', 'test-plugins/modules');
             if (!fs.existsSync(moduleDirectory)) {
               fs.mkdirSync(moduleDirectory);
             }
             fs.writeFileSync(path.join(moduleDirectory, `${name}.js`), response.data, 'utf-8');
             fn();
           })
           .catch(err => {
             fn(err);
           });
    });
    socket.on('loadComponents', function (fn) {
      const pathToComponent = path.join(__dirname, './plugins/test-plugins/components');
      if (!fs.existsSync(pathToComponent)) {
        return fn([]);
      }
      const dir = fs.readdirSync(pathToComponent);
      const pathToMap = dir.map(item => {
        const name = item.split('.');
        name.pop();
        return {
          name: item,
          module: name.join('.'),
          url: 'test-plugins/components/' + item
        };
      });
      fn(pathToMap);
    });
    socket.on('addComponents', function (name, fn) {
      axios.get(`https://unpkg.com/${name}`)
           .then(response => {
             const moduleDirectory = path.join(__dirname, './plugins', 'test-plugins/components');
             if (!fs.existsSync(moduleDirectory)) {
               fs.mkdirSync(moduleDirectory);
             }
             fs.writeFileSync(path.join(moduleDirectory, `${name}.js`), response.data, 'utf-8');
             fn();
           })
           .catch(err => {
             fn(err);
           });
    });
    socket.on('copyFile', (oldPath, newPath, fn) => {
      try {
        copyOrMoveFile(oldPath, newPath, 'copy');
        fn();
      } catch (e) {
        fn(e);
      }
    });
    socket.on('moveFile', (oldPath, newPath, fn) => {
      try {
        copyOrMoveFile(oldPath, newPath, 'move');
        fn();
      } catch (e) {
        fn(e);
      }
    });
    socket.on('exportModel', (name, content, collection, plugins, filePath, fn) => {
      try {
        const writePath = path.join(__dirname, './plugins', plugins, filePath);
        fsExtra.outputJsonSync(writePath + `/${name}.${collection}.json`, content);
        fn();
      } catch (e) {
        fn(e);
      }
    });
    socket.on('importModel', (collection, filePath, fn) => {
      const content = fs.readFileSync(path.join(__dirname, './plugins', filePath), 'utf-8');
      cms.getModel(collection).create(JSON.parse(content))
         .then(res => {
           fn(null, res);
         })
         .catch(err => {
           fn(err);
         });
    });
  });
  cms.app.get('/package', function (req, res) {
    axios.get(`https://www.npmjs.com/search/suggestions?q=${req.query.q}`)
         .then(response => {
           res.status(200).json(response.data);
         })
         .catch(err => {
           res.status(400).json(err.response.data);
         });
  });
};
