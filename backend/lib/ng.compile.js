'use strict';
var jsdom = require("jsdom"),
    path = require('path');

var ENVIORMENT_NOT_READY = "Angular environment not yet ready";

let envReady = false;
let envReadyCallback;


jsdom.env({
    html: '<p></p>',
    done: (errors, window) => {
        /* istanbul ignore if */
        if (errors)
            console.log(errors);
        else {
            global.window = window;
            global.document = window.document;
            envReady = true;
            if (envReadyCallback) envReadyCallback();
        }
    }
});

class ngCompile {
    constructor(modules, angularPath, settings, cb) {

        if (!(modules instanceof Array)) {
            modules = [];
        }

        this.modules = modules;
        this.ready = false;

        if (!envReady) throw new Error(ENVIORMENT_NOT_READY);

        global['Node'] = class {
        };
        this._modules = [];

        require('angular/angular.js');
        global.angular = global.window.angular;
        this._modules.push('ng');

        this.modules.forEach((module) => {
            require(path.resolve(process.cwd(), module.path));
            this._modules.push(module.name);
        });

        this.window = global.window;
        this.angular = window.angular;

        cb(this);

        window.angular.injector(this._modules).invoke(['$rootScope', '$compile', '$interpolate', ($rootScope, $compile, $interpolate) => {
            this.services = {$rootScope: $rootScope, $compile: $compile, $interpolate: $interpolate};
            this.ready = true;
            if (typeof this.readyCallback === "function") this.readyCallback();
        }]);
    }

    static onEnvReady(callback) {
        if (envReady)
            callback();
        else
            envReadyCallback = callback;
    }

    onReady(callback) {
        if (this.ready)
            callback();
        else
            this.readyCallback = callback;
    }

    $new() {
        if (!this.ready) throw new Error(ENVIORMENT_NOT_READY);
        return this.services.$rootScope.$new()
    }

    $interpolate (html) {
        if (!this.ready) throw new Error(ENVIORMENT_NOT_READY);
        return this.services.$interpolate(html)
    }

    $compile (html, init) {
        if (!this.ready) throw new Error(ENVIORMENT_NOT_READY);
        if (typeof html === "object") html = (html.length ? html[0].outerHTML : html.outerHTML);
        var $scope = this.$new(), _self = this;
        const fns = _self.services.$rootScope.fns = [];
        if (init) init(_self.services.$rootScope);
        return function*(context) {
            _self.angular.extend($scope, context);
            let elem = _self.services.$compile(html)($scope);
            elem = _self.angular.element('<div/>').append(elem);

            $scope.$apply();
            while (fns.length > 0) {
                for (const {fn, args} of fns) yield* fn(...args);
                fns.length = 0;
                $scope.$apply();
            }

            const str = elem[0].innerHTML;
            $scope.$destroy();
            $scope = null;
            return str;
        }
    }
}

module.exports = ngCompile;