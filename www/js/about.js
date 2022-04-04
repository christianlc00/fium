const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {

    ipcRenderer.on('fromBackToFront', (event, arg) => {
        let action = arg.action;
        let data = arg.data;

        switch (action) {
            case 'init':
                init(data);
                break;
        }
    });
});

function init(datos){
    let versionElement = document.getElementById('version');
    let appIconElement = document.getElementById('appIcon');
    versionElement.innerHTML = datos.version;
    appIconElement.src = datos.icon;
}

function openExternalURL(url) {
    ipcRenderer.send('fromFrontToBack', {
        action: 'openExternalURL',
        data: url
    });
}