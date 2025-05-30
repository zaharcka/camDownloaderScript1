const fs = require('fs');
const ftp = require('basic-ftp');
const readline = require('readline');
const { Client } = require('ssh2');

const HOST =  '45.146.164.50';
const FTP_USER = 'user_script1';
const FTP_PASSWORD = '|M[L(]RR0V^Dqkpu';

const DELETE_REMOTE_FILES = true;

const ftpConfig = {
    host: HOST,
    user: FTP_USER,
    password: FTP_PASSWORD,
}

const sshConfig = {
    host: HOST,
    port: 22,
    username: 'root',
    agent: 'pageant'
};
async function downloadDirectory(ftpClient, remoteDir, localDir, remoteEmpty = false) {
    console.log('Download ', remoteDir);
    await ftpClient.cd(remoteDir);
    const files = await ftpClient.list();
    console.log(`Files in ${remoteDir} : `, files.length)

    if (files.length === 0) {
        console.log('Empty dir ', remoteDir);
        if (remoteEmpty) {
            await ftpClient.removeDir(remoteDir);
        }
    }
    for (const item of files) {
        if (item.isDirectory) {
            const dirPath = localDir + '/' + item.name;
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath);
                console.log('Created local directory:', item.name);
            }
            await downloadDirectory(ftpClient, remoteDir + '/' + item.name, dirPath, true);
        } else {
            const localFilePath = localDir + '/' + item.name;
            //await ftpClient.downloadTo(localFilePath, item.name);
            try {
                const localfile = `${localFilePath}`.replaceAll('/', '\\');
                const res = await fs.promises.access(localfile);
                console.log(`File ${item.name} already downloaded.`);
                if (DELETE_REMOTE_FILES) {
                    console.log('Deleting remote file ', item.name)
                    await ftpClient.remove(item.name);
                }
            } catch (error) {
                // Если файл не существует, скачиваем его
                await ftpClient.downloadTo(localFilePath, item.name);
                console.log(`File ${item.name} downloaded to ${localFilePath}`);
                if (DELETE_REMOTE_FILES) {
                    console.log('Deleting remote file ', item.name);
                    await ftpClient.remove(item.name);
                }
            }
            //console.log('Downloaded file:', item.name);
        }
    }
}

const restartFTP = () => {
    const conn = new Client();
    conn.on('ready', () => {
        console.log('SSH соединение установлено.');

        // Команда для перезапуска FTP демона
        const command = 'sudo systemctl restart vsftpd'; // Замените "vsftpd" на нужный сервис

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
    }).connect(sshConfig);
};

async function main() {
    const ftpClient = new ftp.Client();
    ftpClient.ftp.verbose = false;

    try {
        console.log('Try to connect...')
        await ftpClient.access(ftpConfig);
        console.log('Success');
        await downloadDirectory(ftpClient, '/cam192.168.2.50_001217b8e137', 'E:\\Cam', false);

    } catch(err) {
        console.error("Ошибка скачивания > ", err);
        ftpClient.close();
        await waitForExit({callback: main}); // Задержка перед закрытием
    } finally {
		ftpClient.close();
	}
}

function waitForExit({callback}) {
    return new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Press 1 to retry, 2 to restart FTP and retry, or other to exit\n', (answer) => {
            rl.close();
            if (answer === "1" && callback) {
                callback()
            } else if (answer === "2" && callback) {
                restartFTP();
                callback();
            }
            resolve();
        });
    });
}


try {
main();
} catch (e) {
	console.log('ERROR!');
	console.log(e.message);
}

