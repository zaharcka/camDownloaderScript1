# FTP Download Script

## Description
This script downloads files recursively from an FTP server to a local directory. It includes options to delete files from the server after successful download and can attempt to restart the FTP service via SSH if download/connection errors occur, prompting the user for action.

## Prerequisites
*   **Node.js:** Ensure Node.js is installed on your system. You can download it from [https://nodejs.org/](https://nodejs.org/).
*   **npm Packages:** The script relies on the following npm packages:
    *   `basic-ftp`: For FTP communication.
    *   `ssh2`: For SSH communication to restart the FTP server.

    Install these packages by running the following command in the script's directory:
    ```bash
    npm install basic-ftp ssh2
    ```

## Configuration (`config.json`)
A `config.json` file must be created in the same directory as `ftpScript.js`. This file stores all necessary connection and operational settings.

**Example `config.json` structure:**
```json
{
  "ftpConfig": {
    "host": "YOUR_FTP_HOST",
    "user": "YOUR_FTP_USER",
    "password": "YOUR_FTP_PASSWORD",
    "remoteDir": "/path/to/remote/directory/to/download",
    "localDir": "./downloaded_files"
  },
  "sshConfig": {
    "host": "YOUR_SSH_HOST",
    "port": 22,
    "username": "YOUR_SSH_USERNAME",
    "agent": "pageant", 
    "privateKeyPath": "C:\\Users\\YourUser\\.ssh\\id_rsa", 
    "restartCommand": "sudo systemctl restart vsftpd"
  },
  "deleteRemoteFiles": true
}
```

### Configuration Fields:

*   **`ftpConfig`**:
    *   `host`: (String) The hostname or IP address of the FTP server.
    *   `user`: (String) The username for FTP authentication.
    *   `password`: (String) The password for FTP authentication.
    *   `remoteDir`: (String) The absolute path on the FTP server to the directory from which files should be downloaded (e.g., `/cam_recordings`).
    *   `localDir`: (String) The local path where downloaded files will be stored. This can be a relative path (e.g., `./downloaded_files`) or an absolute path (e.g., `E:\\Cam_Backups`). For Windows paths in JSON, use double backslashes (`\\\\`) or single forward slashes (`/`).
*   **`sshConfig`**: (Used for attempting to restart the FTP server on error)
    *   `host`: (String) The hostname or IP address of the SSH server (often the same as the FTP host).
    *   `port`: (Number) The SSH port (typically 22).
    *   `username`: (String) The username for SSH authentication.
    *   `agent`: (String, Optional) Specifies the SSH agent to use (e.g., `"pageant"` for Pageant on Windows). If using a private key, this may be ignored or can be omitted.
    *   `privateKeyPath`: (String, Optional) The absolute path to your SSH private key file (e.g., `"C:\\Users\\YourUser\\.ssh\\id_rsa"` or `"/home/user/.ssh/id_rsa"`). **This takes precedence over agent-based authentication if provided and valid.** For Windows paths in JSON, remember to use double backslashes.
    *   `restartCommand`: (String) The command to execute on the SSH server to restart the FTP service (e.g., `"sudo systemctl restart vsftpd"` or `"sudo service proftpd restart"`).
*   **`deleteRemoteFiles`**: (Boolean)
    *   Set to `true` to delete files from the FTP server after they are successfully downloaded.
    *   Set to `false` to keep the files on the FTP server.

**Security Note:**
The `config.json` file will contain sensitive credentials. **Do not commit this file to version control if it contains real passwords or private key paths.** The project's `.gitignore` file is already configured to ignore `config.json` to help prevent accidental commits.

## Running the Script
To run the script, navigate to its directory in your terminal and execute:
```bash
node ftpScript.js
```

## SSH Private Key (Optional)
If you configure the script to use an SSH private key (`privateKeyPath` in `sshConfig`):
*   The key should typically be in OpenSSH format.
*   For Linux/macOS users, ensure the private key file has restrictive permissions for security:
    ```bash
    chmod 600 /path/to/your/private/key
    ```

## Error Handling
If the script encounters errors during FTP operations (like connection issues or download failures), it will prompt you with options:
1.  **Retry:** Attempt the operation again.
2.  **Restart FTP and Retry:** Attempt to restart the FTP server via SSH (using the `sshConfig` settings) and then retry the operation.
3.  **Exit:** Terminate the script.

---
This `README.md` provides a good overview for users to set up and run the script.
