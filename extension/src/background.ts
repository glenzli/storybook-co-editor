import { createLogger } from './utils/logger';

const logger = createLogger('Background');

// Allow clicking the extension icon to open the side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => logger.error("SidePanel behavior setup failed:", e));

const remoteLog = (level: string, message: string) => {
    fetch('http://127.0.0.1:14320/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({ level, message, source: 'background' })
    }).catch(() => {});
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log') {
        remoteLog(request.payload.level, request.payload.message);
        sendResponse({ success: true });
        return true;
    }
    if (request.action === 'saveImage') {
        logger.info(`saveImage requested: ${request.payload.url}`);
        remoteLog('info', `saveImage requested: ${request.payload.url}`);
        fetch('http://127.0.0.1:14320/api/save-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify(request.payload)
        })
        .then(r => r.json())
        .then(data => sendResponse(data))
        .catch(err => {
            logger.error(`saveImage fetch failed: ${err.message}`);
            remoteLog('error', `saveImage fetch failed: ${err.message}`);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
    
    if (request.action === 'startBatch') {
        logger.info(`startBatch requested: total=${request.payload.total}`);
        remoteLog('info', `startBatch requested: total=${request.payload.total}`);
        fetch('http://127.0.0.1:14320/api/start-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify(request.payload)
        })
        .then(r => r.json())
        .then(data => sendResponse(data))
        .catch(err => {
            logger.error(`startBatch fetch failed: ${err.message}`);
            remoteLog('error', `startBatch fetch failed: ${err.message}`);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
    
    if (request.action === 'cancelBatch') {
        fetch('http://127.0.0.1:14320/api/cancel-batch', { method: 'POST', mode: 'cors' })
        .then(r => r.json())
        .then(data => sendResponse(data))
        .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});
