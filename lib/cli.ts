/// <reference path="../typings/update-notifier/update-notifier.d.ts" />
/// <reference path="../typings/commander/commander.d.ts" />

/// <reference path="./insight.d.ts" />

import updateNotifier = require("update-notifier");
var pkg = require("../package.json");

var notifier = updateNotifier({
    packageName: pkg.name,
    packageVersion: pkg.version
});
if (notifier.update) {
    notifier.notify();
}

import readline = require("readline");

import dtsm = require("./index");

import Insight = require("insight");
var insight = new Insight({
    // Google Analytics tracking code
    trackingCode: "UA-6628015-5",
    packageName: pkg.name,
    packageVersion: pkg.version
});

import program = require("commander");

(<any>program)
    .version(pkg.version, "-v, --version")
    .option("--insight <use>", "send usage opt in/out. in = `--insight true`, out = `--insight false`")
    .option("--force-online", "force turn on online check")
    .option("--remote <uri>", "uri of remote repository")
    .option("--config <path>", "path to json file");

function setup():Promise<dtsm.Manager> {
    "use strict";

    var forceOnline:boolean = (<any>program).forceOnline;
    var configPath:string = (<any>program).config;
    var remoteUri:string = (<any>program).remote;
    var insightStr = (<any>program).insight;

    var promise:Promise<void>;
    if (typeof insightStr === "string") {
        if (insightStr !== "true" && insightStr !== "false") {
            return Promise.reject("--insight options required \"true\" or \"false\"");
        } else if (insightStr === "true") {
            insight.config.set('optOut', true);
        } else {
            insight.config.set('optOut', false);
        }
    }
    // ask for permission the first time
    if (insight.optOut === undefined) {
        promise = new Promise((resolve:(value?:any)=>void, reject:(error:any)=>void)=> {
            insight.askPermission(null, ()=> {
                resolve();
            });
        });
    } else {
        promise = Promise.resolve(<any>null);
    }

    var options:dtsm.IOptions = {
        configPath: configPath || "dtsm.json",
        baseRepo: remoteUri,
        forceOnline: forceOnline,
        track: insight.track.bind(insight)
    };
    return promise.then(()=> new dtsm.Manager(options));
}

function errorHandler(err:any) {
    "use strict";

    console.error(err);
    return Promise.resolve(null).then(()=> {
        process.exit(1);
    });
}

program
    .command("init")
    .description("make new dtsm.json")
    .action((opts:{})=> {
        setup()
            .then(manager => {
                var jsonContent = manager.init();

                console.log("write to " + manager.configPath);
                console.log(jsonContent);
            })
            .catch(errorHandler);
    });

program
    .command("search [phrase]")
    .description("search .d.ts files")
    .option("--raw", "output search result by raw format")
    .action((phrase:string, opts:{raw:boolean;})=> {
        setup()
            .then(manager => {
                manager.checkOutdated(outdated => {
                    if (outdated) {
                        console.warn("caution: repository info is maybe outdated. please exec `dtsm fetch` command");
                    }
                });
                return manager;
            })
            .then(manager => {
                return manager.search(phrase || "");
            })
            .then(fileList => {
                if (opts.raw) {
                    fileList.forEach(fileInfo => {
                        console.log(fileInfo.path);
                    });
                } else {
                    if (fileList.length === 0) {
                        console.log("No results.");
                    } else {
                        console.log("Search results.");
                        console.log("");
                        fileList.forEach(fileInfo => {
                            console.log("\t" + fileInfo.path);
                        });
                    }
                }
            })
            .catch(errorHandler);
    });

program
    .command("fetch")
    .description("fetch all data from remote repos")
    .action((opts:{})=> {
        setup()
            .then(manager=> {
                console.log("fetching...");
                return manager.fetch();
            })
            .catch(errorHandler);
    });

program
    .command("install files...")
    .description("install .d.ts files")
    .option("--save", "save .d.ts file path into dtsm.json")
    .option("--dry-run", "save .d.ts file path into dtsm.json")
    .option("--stdin", "use input from stdin")
    .action((...targets:string[])=> {
        var opts:{save:boolean;dryRun:boolean;stdin:boolean;} = <any>targets.pop();
        var save = !!opts.save;
        var dryRun = !!opts.dryRun;
        var stdin = !!opts.stdin;

        setup()
            .then(manager => {
                if (stdin || targets.length !== 0) {
                    // do not check installFromFile pattern
                    manager.checkOutdated(outdated => {
                        if (outdated) {
                            console.warn("caution: repository info is maybe outdated. please exec `dtsm fetch` command");
                        }
                    });
                }
                return manager;
            })
            .then(manager=> {

                if (!stdin && targets.length === 0) {
                    manager.installFromFile({dryRun: dryRun})
                        .then(result => {
                            Object.keys(result.dependencies).forEach(depName => {
                                console.log(depName);
                            });
                        })
                        .catch(errorHandler);
                } else if (targets.length !== 0) {
                    manager.install({save: save, dryRun: dryRun}, targets)
                        .then(result => {
                            Object.keys(result.dependencies).forEach(depName => {
                                console.log(depName);
                            });
                        })
                        .catch(errorHandler);
                } else {
                    var rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    rl.on("line", (line:string)=> {
                        manager.install({save: save, dryRun: dryRun}, [line])
                            .then(result => {
                                Object.keys(result.dependencies).forEach(depName => {
                                    console.log(depName);
                                });
                            })
                            .catch(errorHandler);
                    });
                }
            })
            .catch(errorHandler);
    });

program.parse(process.argv);
