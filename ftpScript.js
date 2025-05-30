/**
 * @file ftpScript.js
 *
 * Downloads files recursively from an FTP server.
 * Features:
 *  - Option to delete remote files after successful download.
 *  - On download/connection error, can prompt user to retry or attempt to restart the FTP service via SSH.
 *
 * Configuration:
 *  - Requires a `config.json` file in the same directory. See README.md for structure.
 *
 * Basic Invocation:
 *  - node ftpScript.js
 */

const fs = require('fs');
const ftp = require('basic-ftp');
const readline = require('readline');
const { Client } = require('ssh2');
const path = require('path');

// readline is already imported at the top by the original script, so just declare rl
let rl = null;

const config = require('./config.json');

/**
 * Handles the download and optional deletion of a single file.
 * Checks if the file already exists locally before downloading.
 * @param {ftp.Client} ftpClient - The FTP client instance.
 * @param {string} remoteFileName - The name of the file on the FTP server (relative to current FTP directory).
 * @param {string} currentRemoteFtpDir - The current directory on the FTP server.
 * @param {string} localFilePath - The full local path where the file should be saved.
 * @param {boolean} deleteRemote - Whether to delete the remote file after successful download.
 */
async function handleFileDownload(ftpClient, remoteFileName, currentRemoteFtpDir, localFilePath, deleteRemote) {
    try {
        await fs.promises.access(localFilePath);
        // File exists locally
        // console.log(`File ${remoteFileName} already downloaded to ${localFilePath}.`); // Verbose
        if (deleteRemote) {
            const fullRemotePath = path.posix.join(currentRemoteFtpDir, remoteFileName);
            console.log('Deleting remote file:', fullRemotePath);
            try {
                await ftpClient.remove(remoteFileName); // Assumes ftpClient is in currentRemoteFtpDir
            } catch (delErr) {
                console.error(`Error deleting remote file ${fullRemotePath}:`, delErr.message);
            }
        }
    } catch (error) {
        // File does not exist locally, proceed with download
        console.log(`Downloading file ${remoteFileName} to ${localFilePath}...`);
        try {
            await ftpClient.downloadTo(localFilePath, remoteFileName); // Assumes ftpClient is in currentRemoteFtpDir
            console.log(`File ${remoteFileName} downloaded successfully to ${localFilePath}.`);
            if (deleteRemote) {
                const fullRemotePath = path.posix.join(currentRemoteFtpDir, remoteFileName);
                console.log('Deleting remote file:', fullRemotePath);
                try {
                    await ftpClient.remove(remoteFileName); // Assumes ftpClient is in currentRemoteFtpDir
                } catch (delErr) {
                    console.error(`Error deleting remote file ${fullRemotePath}:`, delErr.message);
                }
            }
        } catch (downloadErr) {
            console.error(`Error downloading file ${remoteFileName} to ${localFilePath}:`, downloadErr.message);
            // Do not attempt to delete if download failed
        }
    }
}

/**
 * Recursively downloads a directory from the FTP server.
 * @param {ftp.Client} ftpClient - The FTP client instance.
 * @param {string} remoteDir - The remote directory to download.
 * @param {string} localDir - The local directory to save files into.
 * @param {boolean} [remoteEmpty=false] - Internal flag used to track if a subdirectory was found empty, for potential cleanup.
 */
async function downloadDirectory(ftpClient, remoteDir, localDir, remoteEmpty = false) {
    console.log('Download ', remoteDir);
    try {
        await ftpClient.cd(remoteDir);
    } catch (cdErr) {
        console.error(`Error changing to remote directory ${remoteDir}:`, cdErr.message);
        return; // Cannot proceed if we can't change directory
    }
    const files = await ftpClient.list();
    // console.log(`Files in ${remoteDir} : `, files.length); // Verbose

    if (files.length === 0) {
        console.log('Empty dir ', remoteDir);
        if (remoteEmpty) {
            try {
                await ftpClient.removeDir(remoteDir);
            } catch (error) {
                console.error('Error removing remote directory:', error.message);
            }
        }
    }
    for (const item of files) {
        if (item.isDirectory) {
            const subDirPathLocal = path.join(localDir, item.name);
            if (!fs.existsSync(subDirPathLocal)) {
                try {
                    fs.mkdirSync(subDirPathLocal);
                    // console.log('Created local directory:', item.name); // Verbose
                } catch (mkdirErr) {
                    console.error(`Error creating local directory ${subDirPathLocal}:`, mkdirErr.message);
                    continue; // Skip this directory if creation failed
                }
            }
            // For FTP paths, it's generally safer to use posix separators explicitly.
            const subDirPathRemote = path.posix.join(remoteDir, item.name);
            await downloadDirectory(ftpClient, subDirPathRemote, subDirPathLocal, true);
        } else if (item.isFile) { // Explicitly check for files
            const localFilePath = path.join(localDir, item.name);
            // remoteDir is the current FTP directory, item.name is the filename within it.
            await handleFileDownload(ftpClient, item.name, remoteDir, localFilePath, config.deleteRemoteFiles);
        }
    }
}

/**
 * Attempts to restart the FTP service via SSH using credentials from `config.json`.
 * It uses `sshConfig` properties: `host`, `port`, `username`, and `restartCommand`.
 * Authentication priority:
 *  1. Private key (`privateKeyPath` in `sshConfig`)
 *  2. SSH Agent (`agent` in `sshConfig`, e.g., Pageant on Windows)
 */
const restartFTP = () => {
    const conn = new Client();

    // Start with a copy of the base sshConfig
    let sshConnectionConfig = { ...config.sshConfig };

    if (config.sshConfig && config.sshConfig.privateKeyPath) {
        try {
            const privateKey = fs.readFileSync(config.sshConfig.privateKeyPath);
            sshConnectionConfig.privateKey = privateKey;
            // Remove agent if private key is successfully loaded
            if (sshConnectionConfig.agent) {
                delete sshConnectionConfig.agent;
            }
            console.log('Using private key for SSH connection.');
        } catch (error) {
            console.error('Error reading private key file:', error.message);
            console.log('Falling back to other SSH authentication methods (e.g., agent).');
            // If key reading fails, ensure privateKey property is not set
            delete sshConnectionConfig.privateKey;
        }
    }

    conn.on('ready', () => {
        console.log('SSH соединение установлено.');

        // Команда для перезапуска FTP демона
        // Use restartCommand from config, fallback to a default if not specified
        const command = (config.sshConfig && config.sshConfig.restartCommand) || 'sudo systemctl restart vsftpd';

        conn.exec(command, (err, stream) => {
            if (err) {
                console.error('Ошибка выполнения команды:', err.message);
                conn.end();
                return;
            }
            stream
                .on('close', (code, signal) => {
                    conn.end();
                })
                .on('data', (data) => {
                    console.log('Вывод:', data.toString());
                })
                .stderr.on('data', (data) => {
                console.error('Ошибка:', data.toString());
            });
        });
    }).on('error', (err) => {
        console.error('Ошибка SSH соединения:', err.message);
    }).connect(sshConnectionConfig);
};

async function main() {
    const ftpClient = new ftp.Client();
    ftpClient.ftp.verbose = false;

    try {
        console.log('Try to connect...')
        await ftpClient.access(config.ftpConfig);
        console.log('Success');
        await downloadDirectory(ftpClient, config.ftpConfig.remoteDir, config.ftpConfig.localDir, false);

    } catch(err) {
        console.error("Ошибка скачивания > ", err);
        if (ftpClient && ftpClient.ftp && !ftpClient.closed) {
            ftpClient.close();
        }
        await waitForExit({callback: main}); // Задержка перед закрытием
    } finally {
        if (ftpClient && ftpClient.ftp && !ftpClient.closed) {
            ftpClient.close();
        }
        // Close readline interface if it's open
        if (rl && !rl.closed) {
            rl.close();
        }
    }
}

/**
 * Prompts the user to retry, restart FTP and retry, or exit upon script failure.
 * Manages a readline interface for user input.
 * @param {object} options - Options object.
 * @param {function} options.callback - The function to call if a retry is chosen.
 */
function waitForExit({callback}) {
    return new Promise((resolve) => {
        try {
            if (!rl || rl.closed) {
                rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });
            }
            rl.question('Press 1 to retry, 2 to restart FTP and retry, or other to exit\n', (answer) => {
                if (answer === "1" && callback) {
                    // Don't close rl, will retry
                    callback();
                } else if (answer === "2" && callback) {
                    // Don't close rl, will retry after FTP restart
                    restartFTP();
                    callback();
                } else {
                    // User chose to exit or entered other input
                    if (rl && !rl.closed) {
                        rl.close();
                    }
                }
                resolve();
            });
        } catch (error) {
            console.error('Error in waitForExit:', error.message);
            if (rl && !rl.closed) { // Ensure rl is closed on error too
                rl.close();
            }
            resolve(); // Resolve the promise even if there's an error to avoid hanging
        }
    });
}


try {
    main();
} catch (e) {
    console.log('ERROR!');
    console.log(e.message);
    // Ensure readline is closed on unhandled main exception
    if (rl && !rl.closed) {
        rl.close();
    }
}
