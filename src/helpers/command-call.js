// import { exec } from "node:child_process";
// import { execa } from "execa";
import spawn from "cross-spawn";

/**
 * Call command
 *
 * @param   {String}  command  Command
 *
 * @return  {Object}           Result object
 */
export async function commandCall(command) {
    if (!command || !command.length) {
        return false;
    }

    let [prog, ...args] = command.split(" ");

    args = args.map((item) => item.replace(/"/gim, ""));

    let commandResult;

    try {
        // commandResult = await execa(prog, args);
        commandResult = spawn.sync(prog, args);
    } catch (error) {
        commandResult = error;
    }

    // const commandResult = await new Promise((resolve, reject) =>
    //     exec(command, (error, stdout, stderr) => {
    //         console.log(2);

    //         if (error) {
    //             // console.log(error);
    //             // console.log(stdout);
    //             // console.log(stderr);

    //             console.log(3);

    //             return reject({
    //                 result: false,
    //                 error,
    //                 stdout,
    //                 stderr,
    //             });
    //         }

    //         // if (stderr) {
    //         //     return reject(stderr || false);
    //         // }

    //         console.log(4);

    //         return resolve({
    //             result: true,
    //             error,
    //             stdout,
    //             stderr,
    //         });
    //     })
    // );

    return {
        result: !commandResult.error,
        stderr: commandResult.stderr,
        stdout: commandResult.stdout,
        error: commandResult.error,
    };
}

export default commandCall;
