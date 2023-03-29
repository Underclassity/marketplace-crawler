import { exec } from "node:child_process";

/**
 * Call command
 *
 * @param   {String}  command  Command
 *
 * @return  {Object}           Promise
 */
export async function commandCall(command) {
    return new Promise((resolve, reject) =>
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.log(error);
                console.log(stdout);
                console.log(stderr);

                return reject(error || false);
            }

            // if (stderr) {
            //     return reject(stderr || false);
            // }

            return resolve(stdout || true);
        })
    );
}

export default commandCall;
