const core = require('@actions/core');
const { context, GitHub } = require('@actions/github');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

console.log('Starting.');

async function checkDownloadArray(downloadArray, game, issuesFound) {
    for(let download of downloadArray) {
        if(!download.check_download_status) {
            continue;
        }

        console.info(`checkDownloadArray for ${JSON.stringify(download)}`);

        const result = await axios.head(download.url + download.file);
        if(result.status != 200) {
            issuesFound.push({
                download_name: download.name,
                download_status: result.status,
                download_status_text: result.statusText,
                game_name: game.game_name,
                game_app_id: game.app_id
            });
        } else {
            console.info(`checkDownloadArray success for ${JSON.stringify(download)}`);
        }
    }
}

async function run() {
    try {
        const packagesJsonPath = path.join('metadata', 'packagessniper_v2.json');
        const packagesJsonStr = await fs.readFile(packagesJsonPath, 'utf-8');
        const packagesJson = JSON.parse(packagesJsonStr);

        const issuesFound = [];

        for(let game of packagesJson.games) {
            await checkDownloadArray(game.download, game, issuesFound);
        }
        await checkDownloadArray(packagesJson.default_engine.download, packagesJson.default_engine, issuesFound);

        console.info(`issuesFound: ${JSON.stringify(issuesFound)}`);

        const matrix = {
            include: []
        };
        
        for(let downloadIssue of issuesFound) {
            matrix.include.push(downloadIssue);
        }
        
        core.setOutput('matrix', JSON.stringify(matrix));
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

run();
