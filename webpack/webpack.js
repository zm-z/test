const parser = require("@babel/parser");
let types = require("@babel/types"); //用来生成或者判断节点的AST语法树的节点
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;
const { SyncHook } = require("tapable"); //这是一个同步钩子
const path = require("path");
const fs = require("fs")

//获取文件路径
function tryExtensions(modulePath, extensions) {
    if (fs.existsSync(modulePath)) {
        return modulePath;
    }
    for (let i = 0; i < extensions?.length; i) {
        let filePath = modulePath + extensions[i];
        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }
    throw new Error(`无法找到${modulePath}`);
}


class Compiler {
    /**
     * 1.执行编译器的run方法开始进行编译
     * 2.根据配置参数实例化生成编译对象（compilation）
     *   2.1.编译器对象是唯一的，每次编译都会产生一个新的编译对象
     *   2.2.编译对象代表每次编译的结果
     * 3.调用编译对象的build开始进行构建
     * 4.根据entry入口文件开始找到所有的入口
     * 5.从入口文件出发，调用配置的 `loader` 规则，对各模块进行编译(最后输出都是js)
     * 6.找出当前编译文件的依赖模块，在对依赖模块进行编译
     *  6.1.把源码编写成AST
     *  6.2.在AST中找出require，找出依赖的模块名称和绝对路径
     *  6.3.把模块路径push到fileDependencies（fileDependencies文件改变会重新编译）
     *  6.4.把依赖模块push到改模块的dependencies中
     *  6.5.转编译AST生成新代码，赋值给该模块的_source属性
     *  6.6.对依赖模块进行循环变了后进行重新编译
     *  6.7.等所有模块编译完成之后，返回入口模块module
     * 7.把各个代码块 `chunk` 转换成一个一个文件加入到输出列表
     * 8.确定好输出内容之后，根据配置的输出路径和文件名，将文件内容写入到文件系统（这里就是硬盘）
     */
    constructor(webpackOptions) {
        this.option = webpackOptions
        this.hooks = {
            run: new SyncHook(),
            done: new SyncHook()
        }
    }

    run(callback) {
        this.hooks.run.call()//编译器执行run方法
        const onCompiled = (err, stats, fileDependencies) => {
            for (let filename in stats.assets) {
                let filePath = path.join(this.options.output.path, filename);
                fs.writeFileSync(filePath, stats.assets[filename], "utf8");
            }

            callback(err, {
                toJson: () => stats,
            });

            this.hooks.done.call()//编译完成之后回调
        }
        this.compile(onCompiled)
    }

    compile(callback) {
        //实例化编译对象
        const compilation = new Compilation(this.option)
        compilation.build(callback)
    }
}

//将\替换成/
function toUnixPath(filePath) {
    return filePath.replace(/\\/g, "/");
}

const baseDir = toUnixPath(process.cwd()); //获取工作目录，在哪里执行命令就获取哪里的目录，这里获取的也是跟操作系统有关系，要替换成/

//生成运行时代码
function getSource(chunk) {
    return `
     (() => {
      var modules = {
        ${chunk.modules.map(
        (module) => `
          "${module.id}": (module) => {
            ${module._source}
          }
        `
    )}  
      };
      var cache = {};
      function require(moduleId) {
        var cachedModule = cache[moduleId];
        if (cachedModule !== undefined) {
          return cachedModule.exports;
        }
        var module = (cache[moduleId] = {
          exports: {},
        });
        modules[moduleId](module, module.exports, require);
        return module.exports;
      }
      var exports ={};
      ${chunk.entryModule._source}
    })();
     `;
}

class Compilation {
    constructor(webpackOptions) {
        this.option = webpackOptions
        this.modules = []//本次编译所有生成出来的模块
        this.chunks = []//本次编译产出的所有代码块，入口模块和依赖的模块打包在一起为代码块
        this.assets = {}; //本次编译产出的资源文件
        this.fileDependencies = []; //本次打包涉及到的文件，这里主要是为了实现watch模式下监听文件的变化，文件发生变化后会重新编译
    }

    buildModule(name, modulePath) {
        //读取模块内容，获取源代码
        let sourceCode = fs.readFileSync(modulePath, "utf8");
        //buildModule最终会返回一个modules模块对象，每个模块都会有一个id,id是相对于根目录的相对路径
        let moduleId = "./" + path.posix.relative(baseDir, modulePath); //模块id:从根目录出发，找到与该模块的相对路径（./src/index.js）
        //创建模块对象
        let module = {
            id: moduleId,
            names: [name], //names设计成数组是因为代表的是此模块属于哪个代码块，可能属于多个代码块
            dependencies: [], //它依赖的模块
            _source: "", //该模块的代码信息
        };
        //找到对应的lodash对原文件进行处理
        let loaders = []
        let { rules } = this.option.module
        rules.forEach((rule) => {
            let { test } = rule;
            //如果模块的路径和正则匹配，就把此规则对应的loader添加到loader数组中
            if (modulePath.match(test)) {
                loaders.push(...rule.use);
            }
        });

        //自右向左对模块进行转译
        sourceCode = loaders.reduceRight((code, loader) => {
            return loader(code);
        }, sourceCode);

        //通过loader翻译后的内容一定得是js内容，因为最后得走我们babel-parse，只有js才能成编译AST
        let ast = parser.parse(sourceCode, { sourceType: "module" });
        traverse(ast, {
            CallExpression: (nodePath) => {
                const { node } = nodePath;
                //7.2：在 `AST` 中查找 `require` 语句，找出依赖的模块名称和绝对路径
                if (node.callee.name === "require") {
                    let depModuleName = node.arguments[0].value; //获取依赖的模块
                    let dirname = path.posix.dirname(modulePath); //获取当前正在编译的模所在的目录
                    let depModulePath = path.posix.join(dirname, depModuleName); //获取依赖模块的绝对路径
                    let extensions =  [".js"] //获取配置中的extensions
                    depModulePath = tryExtensions(depModulePath, extensions); //尝试添加后缀，找到一个真实在硬盘上存在的文件
                    //7.3：将依赖模块的绝对路径 push 到 `this.fileDependencies` 中
                    this.fileDependencies.push(depModulePath);
                    //7.4：生成依赖模块的`模块 id`
                    let depModuleId = "./" + path.posix.relative(baseDir, depModulePath);
                    //7.5：修改语法结构，把依赖的模块改为依赖`模块 id` require("./name")=>require("./src/name.js")
                    node.arguments = [types.stringLiteral(depModuleId)];
                    //7.6：将依赖模块的信息 push 到该模块的 `dependencies` 属性中
                    module.dependencies.push({ depModuleId, depModulePath });
                }
            },
        });

        //7.7：生成新代码，并把转译后的源代码放到 `module._source` 属性上
        let { code } = generator(ast);
        module._source = code;
        //7.8：对依赖模块进行编译（对 `module 对象`中的 `dependencies` 进行递归执行 `buildModule` ）
        module.dependencies.forEach(({ depModuleId, depModulePath }) => {
            //考虑到多入口打包 ：一个模块被多个其他模块引用，不需要重复打包
            let existModule = this.modules.find((item) => item.id === depModuleId);
            //如果modules里已经存在这个将要编译的依赖模块了，那么就不需要编译了，直接把此代码块的名称添加到对应模块的names字段里就可以
            if (existModule) {
                //names指的是它属于哪个代码块chunk
                existModule.names.push(name);
            } else {
                //7.9：对依赖模块编译完成后得到依赖模块的 `module 对象`，push 到 `this.modules` 中
                let depModule = this.buildModule(name, depModulePath);
                this.modules.push(depModule);
            }
        });
        //7.10：等依赖模块全部编译完成后，返回入口模块的 `module` 对象
        return module;
    }

    build(callback) {
        let entry = {}
        if (typeof this.option.entry === 'string') {
            entry.main = this.option.entry
        } else {
            entry = this.option.entry
        }
        for (let entryName in entry) {
            //path.posix为了解决不同操作系统的路径分隔符,这里拿到的就是入口文件的绝对路径
            let entryFilePath = path.posix.join(baseDir, entry[entryName]);
            //把入口文件的绝对路径添加到依赖数组（`this.fileDependencies`）中，记录此次编译依赖的模块
            this.fileDependencies.push(entryFilePath)
            //得到入口模块的的 `module` 对象 （里面放着该模块的路径、依赖模块、源代码等）
            let entryModule = this.buildModule(entryName, entryFilePath);
            this.modules.push(entryModule)
        }
        //把各个代码块 `chunk` 转换成一个一个文件加入到输出列表
        this.chunks.forEach((chunk) => {
            let filename = this.options.output.filename.replace("[name]", chunk.name);
            this.assets[filename] = getSource(chunk);
        });

        callback(null,
            {
                chunks: this.chunks,
                modules: this.modules,
                assets: this.assets,
            },
            this.fileDependencies
        )//编译成功回调
    }
}

function webpack(webpackOptions) {
    /**
     * 1.根据配置参数实例化生成编译器对象
     * 2.编译器对象绑定plugins
     */
    let compiler = new Compiler(webpackOptions)
    const { plugins } = webpackOptions
    for (let plugin of plugins) {
        plugin.apply(compiler)
    }
    return compiler
}

//自定义插件WebpackRunPlugin
class WebpackRunPlugin {
    apply(compiler) {
        compiler.hooks.run.tap("WebpackRunPlugin", () => {
            console.log("开始编译");
        });
    }
}

//自定义插件WebpackDonePlugin
class WebpackDonePlugin {
    apply(compiler) {
        compiler.hooks.done.tap("WebpackDonePlugin", () => {
            console.log("结束编译");
        });
    }
}


module.exports = {
    webpack,
    WebpackRunPlugin,
    WebpackDonePlugin
}

