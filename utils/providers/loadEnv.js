import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import chalk from 'chalk';

/**
 * 加载当前目录下的.env文件
 * @param {string} importMetaUrl - import.meta.url 或目录路径
 */
export function loadProviderEnv(importMetaUrl) {
    let providerDir;
    
    if (importMetaUrl.startsWith('file://')) {
        // 处理 import.meta.url
        providerDir = path.dirname(fileURLToPath(importMetaUrl));
    } else {
        // 处理目录路径
        providerDir = importMetaUrl;
    }
    
    const envPath = path.join(providerDir, '.env');
    const envExamplePath = path.join(providerDir, 'env.example');
    
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    } else if (fs.existsSync(envExamplePath)) {
        // 如果.env不存在但env.example存在，可以复制或提示用户
        console.warn(
            chalk.yellow('⚠️  ') + 
            chalk.red.bold(`${path.basename(path.dirname(envPath))} `) +
            chalk.yellow('环境配置缺失\n') +
            chalk.gray('   请复制: ') + chalk.cyan(`${envExamplePath}\n`) +
            chalk.gray('   到: ') + chalk.green(`${envPath}`)
        );
    }
}

export default { loadProviderEnv };
