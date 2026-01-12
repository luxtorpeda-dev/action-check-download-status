const core = require('@actions/core');
const { context, GitHub } = require('@actions/github');
const fs = require('fs').promises;
const path = require('path');

console.log('Starting.');

// Helper to combine a base URL and file path correctly.
function combineUrlAndFile(url, file) {
    return `${url.replace(/\/+$/, '')}/${file.replace(/^\/+/, '')}`;
}

async function checkDownloadArray(downloadArray, game, issuesFound) {
    for (let download of downloadArray) {
        const name = download.name ? download.name.toLowerCase() : '';
        const url = download.url || '';

        if(download.ignore_all_checks) {
            continue;
        }

        // 1. Network (HEAD) Check:
        // If URL does NOT include "https://github.com/luxtorpeda-dev/packages"
        if (!url.includes('https://github.com/luxtorpeda-dev/packages')) {
            console.info(`Processing network check: ${JSON.stringify(download)}`);
            let fullUrl;
            try {
                fullUrl = combineUrlAndFile(url, download.file);
            } catch (e) {
                issuesFound.push({
                    download_name: download.name,
                    download_status: null,
                    download_status_text: `Invalid URL: ${e.message}`,
                    full_url: null,
                    game_name: game.game_name,
                    game_app_id: game.app_id,
                    type: "network_error"
                });
                continue; // Skip further processing for this download entry.
            }
            try {
                const response = await fetch(fullUrl, { method: 'HEAD' });
                if (response.status !== 200) {
                    issuesFound.push({
                        download_name: download.name,
                        download_status: response.status,
                        download_status_text: response.statusText,
                        full_url: fullUrl,
                        game_name: game.game_name,
                        game_app_id: game.app_id,
                        type: "network_error"
                    });
                } else {
                    console.info(`Network check succeeded for ${download.name}`);
                }
            } catch (err) {
                issuesFound.push({
                    download_name: download.name,
                    download_status: null,
                    download_status_text: err.message,
                    full_url: fullUrl,
                    game_name: game.game_name,
                    game_app_id: game.app_id,
                    type: "network_error"
                });
            }
        }

        if(download.ignore_updates) {
            continue;
        }

        // 2. GitHub Release Check:
        // Define ignore conditions that prevent the GitHub release check.
        const ignoreConditions = [
            url.includes('https://github.com/luxtorpeda-dev/packages'),
            name.includes('openjdk'),
            url.includes('quaddicted'),
            name.includes('soundfont'),
            url.includes('ioquake3.org'),
            url.includes('icculus.org'),
            name.includes('soundtrack'),
            name.includes('catalogue'),
            url.includes('slashbunny'),
            url.includes('unreal-archive-files'),
            url.includes('nwjs.io'),
            url.includes('playmorepromode.com'),
            url.includes('daikatana/tree'),
            name.includes('music'),
            name.includes('rvgl'),
            url.includes('ezquake'),
            name === 'eawpats'
        ];

        // Proceed with GitHub release check only if none of the ignore conditions are met.
        if (!ignoreConditions.some(Boolean)) {
            if (url.includes('github.com') && url.includes('/releases/')) {
                console.info(`Processing new release check: ${JSON.stringify(download)}`);
                try {
                    const parsedUrl = new URL(url);
                    const parts = parsedUrl.pathname.split('/').filter(Boolean);
                    // Expected pattern: [owner, repo, "releases", "download", releaseTag, ...]
                    if (parts.length >= 5) {
                        const owner = parts[0];
                        const repo = parts[1];
                        const releaseTag = parts[4];

                        // Construct the current URL using our helper.
                        const currentUrl = combineUrlAndFile(url, download.file);

                        // Query the GitHub API for the latest release.
                        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
                        const apiResponse = await fetch(apiUrl);
                        if (apiResponse.ok) {
                            const latestRelease = await apiResponse.json();
                            const latestTag = latestRelease.tag_name;
                            // Only record an issue if the latest tag is different and the latest tag does not include "-rc"
                            if (latestTag !== releaseTag && !latestTag.includes('-rc')) {
                                issuesFound.push({
                                    download_name: download.name,
                                    game_name: game.game_name,
                                    game_app_id: game.app_id,
                                    type: "new_release",
                                    new_version: latestTag,
                                    current_release: releaseTag,
                                    current_url: currentUrl
                                });
                            }
                        }
                    }
                } catch (err) {
                    // Ignore errors during GitHub release checking.
                }
            }
        }
    }
}

async function run() {
    try {
        const packagesJsonPath = path.join('metadata', 'packagessniper_v2.json');
        const packagesJsonStr = await fs.readFile(packagesJsonPath, 'utf-8');
        const packagesJson = JSON.parse(packagesJsonStr);

        const issuesFound = [];

        // Process games.
        if (Array.isArray(packagesJson.games)) {
            for (let game of packagesJson.games) {
                if (Array.isArray(game.download)) {
                    await checkDownloadArray(game.download, game, issuesFound);
                }
            }
        }

        // Process default_engine.
        if (packagesJson.default_engine && Array.isArray(packagesJson.default_engine.download)) {
            await checkDownloadArray(packagesJson.default_engine.download, packagesJson.default_engine, issuesFound);
        }

        console.info(`Issues Found: ${JSON.stringify(issuesFound)}`);

        // Prepare the matrix output.
        const matrix = {};
        if (issuesFound.length) {
            matrix.include = issuesFound;
        }
        core.setOutput('matrix', JSON.stringify(matrix));
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
