const childProcess = require("node:child_process");

function createProcessManager({ platform = process.platform, commands = childProcess } = {}) {
  const children = new Set();
  let stopping = false;
  let stopPromise;

  function track(child) {
    children.add(child);
    const remove = () => children.delete(child);
    child.once("exit", remove);
    child.once("error", remove);
    return child;
  }

  function run(method, args) {
    if (stopping) {
      throw new Error("O JARVIS está sendo encerrado.");
    }
    return track(commands[method](...args));
  }

  function killProcess(pid) {
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
      return Promise.resolve(false);
    }

    if (platform !== "win32") {
      try {
        process.kill(pid, "SIGTERM");
        return Promise.resolve(true);
      } catch (error) {
        return Promise.resolve(error.code === "ESRCH");
      }
    }

    return new Promise((resolve) => {
      commands.execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        timeout: 4000,
      }, (error) => resolve(!error || error.code === 128));
    });
  }

  function killChild(child) {
    return children.has(child) && child.pid ? killProcess(child.pid) : Promise.resolve(true);
  }

  return {
    spawn: (...args) => run("spawn", args),
    execFile: (...args) => run("execFile", args),
    killProcess,
    killChild,
    stopAll() {
      if (!stopPromise) {
        stopping = true;
        stopPromise = Promise.allSettled(Array.from(children, killChild));
      }
      return stopPromise;
    },
  };
}

module.exports = { createProcessManager };
