const {
    app,
    shell,
    ipcMain,
    dialog,
    BrowserWindow,
    Tray,
    Menu
} = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const upath = require('upath');
const sqlite3 = require('sqlite3').verbose();
const exec = require('child_process').exec;

const COMMON_WINDOW_PROPERTIES = {
    width: 800,
    minWidth: 450,
    height: 600,
    minHeight: 450,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
    }
};

let
    settingsWindow,
    aboutWindow,
    tray,
    contextMenu,
    spa,
    entorno,
    recurso,
    configs,
    selections,
    spas,
    entornos,
    todosEntornos,
    recursos,
    todosRecursos,
    updateDownloaded;

const db = new sqlite3.Database('GestorSPAs.db');
const syncDB = {
    create: async (table, columns) => {
        let sql = `CREATE TABLE IF NOT EXISTS ${table} (${columns})`;
        return new Promise(resolve => {
            db.run(sql, (err, result) => {
                resolve(result);
            });
        });
    },
    selectAll: async (table, where = null) => {
        where = (where && where.length > 0) ? ` WHERE ${where}` : '';
        let sql = `SELECT rowid as id, * FROM ${table}${where}`;
        return new Promise(resolve => {
            db.all(sql, (err, rows) => {
                resolve(rows);
            });
        });
    },
    select: async (fields, table, where = null) => {
        where = (where && where.length > 0) ? ` WHERE ${where}` : '';
        let sql = `SELECT ${fields} FROM ${table}${where}`;
        return new Promise(resolve => {
            db.all(sql, (err, rows) => {
                resolve(rows);
            });
        });
    },
    exists: async (table, where) => {
        let sql = `SELECT rowid FROM ${table} WHERE ${where}`;
        return new Promise(resolve => {
            db.all(sql, (err, rows) => {
                let found = false;
                if (rows && rows.length > 0) {
                    found = true;
                }
                resolve(found);
            });
        });
    },
    insert: async (table, values, columns = null) => {
        columns = (columns) ? ` (${columns})` : '';
        let sql = `INSERT INTO ${table}${columns} VALUES (${values})`;
        return new Promise(resolve => {
            db.run(sql, (err, result) => {
                resolve(result);
            });
        });
    },
    update: async (table, changes, where = null) => {
        where = (where) ? ` WHERE ${where}` : '';
        let sql = `UPDATE ${table} SET ${changes}${where}`;
        return new Promise(resolve => {
            db.run(sql, (err, result) => {
                resolve(result);
            });
        });
    },
    delete: async (table, where) => {
        let sql = `DELETE FROM ${table} WHERE ${where}`;
        return new Promise(resolve => {
            db.run(sql, (err, result) => {
                resolve(result);
            });
        });
    }
};

app.whenReady().then(async () => {
    init();
});

async function init() {
    await createDBs();
    createTrayIcon();
    updateDownloaded = false;
    await getAll();
    reloadApache();
}

async function createDBs() {
    await syncDB.create('CONFIG', `
        clave TEXT NOT NULL PRIMARY KEY,
        valor TEXT NOT NULL
    `);
    await syncDB.create('SELECTIONS', `
        spa TEXT NOT NULL,
        entorno TEXT NOT NULL,
        recurso TEXT NOT NULL,
        FOREIGN KEY (spa) REFERENCES RECURSO (spa) ON DELETE CASCADE ON UPDATE CASCADE
        FOREIGN KEY (entorno) REFERENCES RECURSO (entorno) ON DELETE CASCADE ON UPDATE CASCADE
        FOREIGN KEY (recurso) REFERENCES RECURSO (credencial1) ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await syncDB.create('SPA', `
        nombre TEXT NOT NULL PRIMARY KEY,
        dominio TEXT NOT NULL UNIQUE,
        tipo TEXT NOT NULL,
        puerto TEXT NOT NULL DEFAULT 80,
        ruta TEXT NOT NULL,
        dns TEXT NOT NULL
    `);
    await syncDB.create('ENTORNO', `
        nombre TEXT NOT NULL,
        spa TEXT NOT NULL,
        proxyPassAPI TEXT NOT NULL,
        proxyPassReverseAPI TEXT NOT NULL,
        proxyPassOpenAPI TEXT NOT NULL,
        proxyPassReverseOpenAPI TEXT NOT NULL,
        proxyPassSites TEXT NOT NULL,
        proxyPassReverseSites TEXT NOT NULL,
        PRIMARY KEY(nombre, spa),
        FOREIGN KEY (spa) REFERENCES SPA (nombre) ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await syncDB.create('RECURSO', `
        nombre TEXT NOT NULL,
        spa TEXT NOT NULL,
        entorno TEXT NOT NULL,
        credencial1 TEXT NOT NULL,
        tipoCredencial1 TEXT NOT NULL,
        credencial2 TEXT NOT NULL,
        tipoCredencial2 TEXT NOT NULL,
        PRIMARY KEY(spa, entorno, credencial1),
        FOREIGN KEY (spa) REFERENCES SPA (nombre) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (entorno) REFERENCES ENTORNO (nombre) ON DELETE CASCADE ON UPDATE CASCADE
    `);
    await insertDefaultConfig();
}

async function insertDefaultConfig() {
    let defaultConfig = [
        {
            clave: 'VHOSTS_PATH',
            valor: 'C:/xampp/apache/conf/extra/httpd-vhosts.conf'
        },
        {
            clave: 'APACHE_START_FILE',
            valor: 'C:/xampp/apache_start.bat'
        },
        {
            clave: 'APACHE_STOP_FILE',
            valor: 'C:/xampp/apache_stop.bat'
        },
        {
            clave: 'AUTO_APPLY',
            valor: 'false'
        }
    ];

    await defaultConfig.forEach(async conf => {
        if (!(await syncDB.exists('CONFIG', `clave='${conf.clave}'`))) {
            await syncDB.insert('CONFIG', `'${conf.clave}', '${conf.valor}'`)
        }
    });
}

async function setCurrentSPA(sp) {
    if (!(await syncDB.exists('SELECTIONS', `spa='${sp.nombre}'`))) {
        await syncDB.insert('SELECTIONS', `'${sp.nombre}'`, 'spa');
    }

    if (await syncDB.exists('CONFIG', `clave='CURRENT_SPA'`)) {
        await syncDB.update('CONFIG', `valor='${sp.nombre}'`, `clave='CURRENT_SPA'`);
    } else {
        await syncDB.insert('CONFIG', `'CURRENT_SPA', '${sp.nombre}'`);
    }

    spa = sp;

    getAll();
}

async function setCurrentENV(env) {
    if (await syncDB.exists('SELECTIONS', `spa='${env.spa}'`)) {
        await syncDB.update('SELECTIONS', `entorno='${env.nombre}', recurso=''`, `spa='${env.spa}'`)
    } else {
        await syncDB.insert('SELECTIONS', `'${env.spa}', '${env.nombre}', ''`, 'spa, entorno, recurso');
    }

    entorno = env;

    getAll();
}

async function setCurrentRES(res) {
    if (await syncDB.exists('SELECTIONS', `spa='${res.spa}'`)) {
        await syncDB.update('SELECTIONS', `recurso='${res.credencial1}'`, `spa='${res.spa}'`);
    } else {
        await syncDB.insert('SELECTIONS', `'${res.spa}', '${res.entorno}', '${res.credencial1}'`);
    }

    recurso = res;

    getAll();
}

async function getRecursos() {
    if (selections && selections.currentSPA && selections[selections.currentSPA] && selections[selections.currentSPA].entorno) {
        recursos = await syncDB.selectAll('RECURSO', `spa='${selections.currentSPA}' AND entorno='${selections[selections.currentSPA].entorno}'`);
    }
}

async function getEntornos() {
    if (selections && selections.currentSPA) {
        entornos = await syncDB.selectAll('ENTORNO', `spa='${selections.currentSPA}'`);
    }
}

async function getAll() {
    let selectionsResult = await syncDB.select('spa, entorno, recurso', 'SELECTIONS');

    if (selectionsResult && selectionsResult.length > 0) {
        selections = {};
        selectionsResult.forEach(row => {
            selections[row.spa] = {};
            selections[row.spa].entorno = row.entorno;
            selections[row.spa].recurso = row.recurso;
        });
    }

    let CURRENT_SPA = await syncDB.select('clave, valor', 'CONFIG', "clave='CURRENT_SPA'");

    if (CURRENT_SPA[0] && CURRENT_SPA[0].valor) {
        selections.currentSPA = CURRENT_SPA[0].valor;
    }

    await getEntornos();
    await getRecursos();

    configs = await syncDB.selectAll('CONFIG');
    spas = await syncDB.selectAll('SPA');
    todosEntornos = await syncDB.selectAll('ENTORNO');
    todosRecursos = await syncDB.selectAll('RECURSO');

    buildContextMenu();

    let spaName = (spa) ? spa.nombre : '???';
    let envName = (entorno) ? entorno.nombre : '???';

    if (spaName != '???' && envName != '???') {
        tray.setToolTip(`Ejecutando ${spaName} en entorno ${envName}.`);
    }
}

function buildContextMenu() {
    let recursosItems = [];
    let entornosItems = [];
    let spasItems = [];
    let applyChangesItem = [];
    let otrosItems = [];
    let updateItem = [];
    let exitItem = [];

    let autoApplyChanges = (getConfig('AUTO_APPLY') == 'true') ? true : false;

    if (recursos && recursos.length > 0) {
        recursosItems = [];

        for (let i = 0; i < recursos.length; i++) {
            let item = {
                label: `${recursos[i].nombre} - ${recursos[i].credencial1}`,
                type: 'radio',
                checked: (selections[recursos[i].spa].recurso == recursos[i].credencial1) ? true : false,
                async click() {
                    await setCurrentRES(recursos[i]);
                    if (autoApplyChanges) await applySelection();
                }
            }

            recursosItems.push(item);
        }

        recursosItems.push({
            type: 'separator'
        });
    }

    if (entornos && entornos.length > 0) {
        entornosItems = [];

        for (let i = 0; i < entornos.length; i++) {
            let item = {
                label: `${entornos[i].nombre}`,
                type: 'radio',
                checked: (selections[entornos[i].spa] && selections[entornos[i].spa].entorno == entornos[i].nombre) ? true : false,
                async click() {
                    await setCurrentENV(entornos[i]);
                }
            }

            entornosItems.push(item);
        }

        entornosItems.push({
            type: 'separator'
        });
    }

    if (spas && spas.length > 0) {
        spasItems = [];

        for (let i = 0; i < spas.length; i++) {
            let item = {
                label: `${spas[i].nombre}`,
                type: 'radio',
                checked: (spa && spa.nombre == spas[i].nombre) ? true : false,
                async click() {
                    await setCurrentSPA(spas[i]);
                }
            }

            spasItems.push(item);
        }

        spasItems.push({
            type: 'separator'
        });
    }

    applyChangesItem = [
        {
            label: 'Aplicar Cambios',
            type: 'normal',
            async click() {
                await applySelection();
            }
        }
    ]

    otrosItems = [
        {
            label: 'Agregar SPA',
            type: 'normal',
            async click() {
                if (!settingsWindow) {
                    await createSettingsWindow();
                } else {
                    settingsWindow.focus();
                }
                settingsWindow.webContents.send('fromBackToFront', {
                    action: 'openModal',
                    data: {
                        tab: 'tabSPAs',
                        configs,
                        spas,
                        entornos: todosEntornos,
                        recursos: todosRecursos
                    }
                });
            }
        },
        {
            label: 'Agregar Entorno',
            type: 'normal',
            async click() {
                if (!settingsWindow) {
                    await createSettingsWindow();
                } else {
                    settingsWindow.focus();
                }
                settingsWindow.webContents.send('fromBackToFront', {
                    action: 'openModal',
                    data: {
                        tab: 'tabEntornos',
                        configs,
                        spas,
                        entornos: todosEntornos,
                        recursos: todosRecursos
                    }
                });
            }
        },
        {
            label: 'Agregar Recurso',
            type: 'normal',
            async click() {
                if (!settingsWindow) {
                    await createSettingsWindow();
                } else {
                    settingsWindow.focus();
                }
                settingsWindow.webContents.send('fromBackToFront', {
                    action: 'openModal',
                    data: {
                        tab: 'tabRecursos',
                        configs,
                        spas,
                        entornos: todosEntornos,
                        recursos: todosRecursos
                    }
                });
            }
        },
        {
            type: 'separator'
        },
        {
            label: 'Configuración',
            type: 'normal',
            click() {
                if (!settingsWindow) {
                    createSettingsWindow();
                } else {
                    settingsWindow.focus();
                }
            }
        },
        {
            label: 'Acerca de',
            type: 'normal',
            click() {
                if (!aboutWindow) {
                    createAboutWindow();
                } else {
                    aboutWindow.focus();
                }
            }
        }
    ];

    updateItem = [
        {
            type: 'separator'
        },
        {
            label: '¡Actualización disponible!',
            type: 'normal',
            click() {
                autoUpdater.quitAndInstall();
            }
        }
    ];

    exitItem = [
        {
            type: 'separator'
        },
        {
            label: 'Salir',
            type: 'normal',
            click() {
                close();
            }
        }
    ];

    let contextMenuItems = spasItems;
    contextMenuItems = contextMenuItems.concat(entornosItems);
    contextMenuItems = contextMenuItems.concat(recursosItems);
    if (!autoApplyChanges) contextMenuItems = contextMenuItems.concat(applyChangesItem);
    contextMenuItems = contextMenuItems.concat(otrosItems);
    if (updateDownloaded) contextMenuItems = contextMenuItems.concat(updateItem);
    contextMenuItems = contextMenuItems.concat(exitItem);

    contextMenu = Menu.buildFromTemplate(contextMenuItems);
    tray.setContextMenu(contextMenu);
}

async function checkApacheRunning() {
    let tasklist = await execShellCommand('tasklist');

    let processes = tasklist.split('\n').filter(line => line.includes('httpd.exe'));
    let result = false;
    if (processes.length > 0) {
        result = true;
    }
    return result;
}

function execShellCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}

function createTrayIcon() {
    tray = new Tray(upath.toUnix(upath.join(__dirname, 'img', 'icon_white.png')));

    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: 'Salir',
            click() {
                close();
            }
        }
    ]));
}

function close() {
    db.close(() => {
        app.quit();
    });
}

async function createSettingsWindow() {
    settingsWindow = new BrowserWindow({
        width: COMMON_WINDOW_PROPERTIES.width,
        minWidth: COMMON_WINDOW_PROPERTIES.minWidth,
        height: COMMON_WINDOW_PROPERTIES.height,
        minHeight: COMMON_WINDOW_PROPERTIES.minHeight,
        autoHideMenuBar: COMMON_WINDOW_PROPERTIES.autoHideMenuBar,
        frame: COMMON_WINDOW_PROPERTIES.frame,
        icon: upath.toUnix(upath.join(__dirname, 'img', 'icon_green.png')),
        webPreferences: COMMON_WINDOW_PROPERTIES.webPreferences
    });

    await settingsWindow.loadFile(upath.toUnix(upath.join(__dirname, 'settings.html')));

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });

    settingsWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
        settingsWindow.webContents.send('fromBackToFront', {
            action: 'allData',
            data: {
                configs,
                spas,
                entornos: todosEntornos,
                recursos: todosRecursos
            }
        });
    });
}

function createAboutWindow() {
    aboutWindow = new BrowserWindow({
        width: COMMON_WINDOW_PROPERTIES.width,
        minWidth: COMMON_WINDOW_PROPERTIES.minWidth,
        height: COMMON_WINDOW_PROPERTIES.minHeight,
        minHeight: COMMON_WINDOW_PROPERTIES.minHeight,
        autoHideMenuBar: COMMON_WINDOW_PROPERTIES.autoHideMenuBar,
        frame: COMMON_WINDOW_PROPERTIES.frame,
        resizable: false,
        icon: upath.toUnix(upath.join(__dirname, 'img', 'icon_green.png')),
        webPreferences: COMMON_WINDOW_PROPERTIES.webPreferences
    });

    aboutWindow.setResizable(false);

    aboutWindow.loadFile(upath.toUnix(upath.join(__dirname, 'about.html')));

    aboutWindow.on('closed', () => {
        aboutWindow = null;
    });

    aboutWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
        aboutWindow.webContents.send('fromBackToFront', {
            action: 'init',
            data: {
                version: app.getVersion(),
                icon: upath.toUnix(upath.join(__dirname, 'img', 'icon_green.png'))
            }
        });
    });
}

async function applySelection() {
    let rows = await syncDB.selectAll('SELECTIONS');

    if (rows && rows.length > 0) {
        let oSPAS = [];
        let oENTORNOS = [];
        let oRECURSOS = [];

        rows.forEach(row => {
            let spa = spas.filter(s => s.nombre == row.spa);
            let ent = todosEntornos.filter(e => e.nombre == row.entorno);
            let rec = todosRecursos.filter(r => r.credencial1 == row.recurso);

            if (spa.length > 0 && ent.length > 0 && rec.length > 0) {
                oSPAS.push(spa[0]);
                oENTORNOS.push(ent[0]);
                oRECURSOS.push(rec[0]);
            }
        });

        createVhostsFile(oSPAS, oENTORNOS, oRECURSOS);
    }
}

function getConfig(configKey) {
    let result = configs.filter(config => config.clave == configKey)[0];
    return result ? result.valor : '';
}

function createVhostsFile(oSPAS, oENTORNOS, oRECURSOS) {
    fs.writeFileSync(upath.toUnix(getConfig('VHOSTS_PATH')), '');
    
    for (let i = 0; i < oSPAS.length; i++) {
        createVhostsSection(oSPAS[i], oENTORNOS[i], oRECURSOS[i]);
    }
    
    reloadApache();
}

function createVhostsSection(oSPA, oENTORNO, oRECURSO) {
    let template = `
<VirtualHost ${oSPA.dominio}:${oSPA.puerto}>
    DocumentRoot "${oSPA.ruta}"
    RewriteEngine On

    <Directory "${oSPA.ruta}">
        Options FollowSymlinks
        Require all granted
        RewriteCond %{REQUEST_FILENAME} -s [OR]
        RewriteCond %{REQUEST_FILENAME} -l [OR]
        RewriteCond %{REQUEST_FILENAME} -d
        RewriteRule ^.*$ - [NC,L]
        RewriteRule ^(.*)$ /
    </Directory>

    ${(oSPA.dominio) ? 'ServerName ' + oSPA.dominio : ''}
    
    SSLProxyEngine on
    SSLProxyCheckPeerCN off
    SSLProxyCheckPeerName off
    SSLProxyCheckPeerExpire off
    
    <ifModule mod_headers.c>
        RequestHeader append SERVICE "${oSPA.nombre}"
        RequestHeader append CLIENT-DNS "${oSPA.dns}"
        
        RequestHeader append X-WASSUP-CRED-USED "${oRECURSO.credencial1}"
        RequestHeader append X-WASSUP-CREDTYPE-USED "${oRECURSO.tipoCredencial1}"
        RequestHeader append X-WASSUP-PA2 "${oRECURSO.credencial2}"
        RequestHeader append X-WASSUP-PA1 "${oRECURSO.tipoCredencial2}"
        
        RequestHeader append X-WASSUP-LRA "MassMarketMobileUser"
    </ifModule>
    
    ${(oENTORNO.proxyPassAPI && oENTORNO.proxyPassReverseAPI) ? 'ProxyPass ' + oENTORNO.proxyPassAPI : ''}
    ${(oENTORNO.proxyPassAPI && oENTORNO.proxyPassReverseAPI) ? 'ProxyPassReverse ' + oENTORNO.proxyPassReverseAPI : ''}

    ${(oENTORNO.proxyPassOpenAPI && oENTORNO.proxyPassReverseOpenAPI) ? 'ProxyPass ' + oENTORNO.proxyPassOpenAPI : ''}
    ${(oENTORNO.proxyPassOpenAPI && oENTORNO.proxyPassReverseOpenAPI) ? 'ProxyPassReverse ' + oENTORNO.proxyPassReverseOpenAPI : ''}
    
    ${(oENTORNO.proxyPassSites && oENTORNO.proxyPassReverseSites) ? 'ProxyPass ' + oENTORNO.proxyPassSites : ''}
    ${(oENTORNO.proxyPassSites && oENTORNO.proxyPassReverseSites) ? 'ProxyPassReverse ' + oENTORNO.proxyPassReverseSites : ''}
</VirtualHost>
    `;

    fs.appendFileSync(upath.toUnix(getConfig('VHOSTS_PATH')), template);
}

async function reloadApache() {
    tray.setImage(upath.toUnix(upath.join(__dirname, 'img', 'icon_yellow.png')));
    await execShellCommand(upath.toUnix(getConfig('APACHE_STOP_FILE')));
    tray.setImage(upath.toUnix(upath.join(__dirname, 'img', 'icon_red.png')));
    execShellCommand(upath.toUnix(getConfig('APACHE_START_FILE')));
    let isApacheRunning;
    do {
        isApacheRunning = await checkApacheRunning();
    } while (!isApacheRunning);
    tray.setImage(upath.toUnix(upath.join(__dirname, 'img', 'icon_green.png')));
}

function deleteItem(arg) {
    let type = arg.type;
    let data = arg.data;

    switch (type) {
        case 'spa':
            deleteSPA(data);
            break;
        case 'entorno':
            deleteEntorno(data);
            break;
        case 'recurso':
            deleteRecurso(data);
            break;
    }
}

async function deleteSPA(arg) {
    await syncDB.delete('SPA', `rowid=${arg.id}`);
    spas = await syncDB.selectAll('SPA');

    buildContextMenu();

    settingsWindow.webContents.send('fromBackToFront', {
        action: 'itemDeleted',
        data: {
            tab: 'tabSPAs',
            data: spas,
            html: 'SPA borrada correctamente.'
        }
    });
}

async function deleteEntorno(arg) {
    await syncDB.delete('ENTORNO', `rowid=${arg.id}`);
    todosEntornos = await syncDB.selectAll('ENTORNO');

    buildContextMenu();

    settingsWindow.webContents.send('fromBackToFront', {
        action: 'itemDeleted',
        data: {
            tab: 'tabEntornos',
            data: todosEntornos,
            html: 'Entorno borrado correctamente.'
        }
    });
}

async function deleteRecurso(arg) {
    await syncDB.delete('RECURSO', `rowid=${arg.id}`);
    todosRecursos = await syncDB.selectAll('RECURSO');

    buildContextMenu();

    settingsWindow.webContents.send('fromBackToFront', {
        action: 'itemDeleted',
        data: {
            tab: 'tabRecursos',
            data: todosRecursos,
            html: 'Recurso borrado correctamente.'
        }
    });
}

function frontRequestData(arg) {
    let tab = arg;
    switch (tab) {
        case 'tabGeneral':
            settingsWindow.webContents.send('fromBackToFront', {
                action: 'data',
                data: {
                    tab: 'tabGeneral',
                    data: configs
                }
            });
            break;
        case 'tabSPAs':
            settingsWindow.webContents.send('fromBackToFront', {
                action: 'data',
                data: {
                    tab: 'tabSPAs',
                    data: spas
                }
            });
            break;
        case 'tabEntornos':
            settingsWindow.webContents.send('fromBackToFront', {
                action: 'data',
                data: {
                    tab: 'tabEntornos',
                    data: todosEntornos
                }
            });
            break;
        case 'tabRecursos':
            settingsWindow.webContents.send('fromBackToFront', {
                action: 'data',
                data: {
                    tab: 'tabRecursos',
                    data: todosRecursos
                }
            });
            break;
    }
}

function frontSaveForm(arg) {
    let type = arg.type;
    let data = arg.data;

    switch (type) {
        case 'general':
            saveSettingsForm(data);
            break;
        case 'spa':
            saveSpaForm(data);
            break;
        case 'entorno':
            saveEntornoForm(data);
            break;
        case 'recurso':
            saveRecursoForm(data);
            break;
    }
}

async function saveSettingsForm(data) {
    let fields = Object.entries(data);

    let count = fields.length;

    await fields.forEach(async config => {
        let key = config[0];
        let value = config[1];

        if (await syncDB.exists('CONFIG', `clave='${key}'`)) {
            await syncDB.update('CONFIG', `valor='${value}'`, `clave='${key}'`);
        } else {
            await syncDB.insert('CONFIG', `'${key}', '${value}'`);
        }

        count--;

        if (count == 0) {
            configs = await syncDB.selectAll('CONFIG');

            buildContextMenu();

            settingsWindow.webContents.send('fromBackToFront', { action: 'data', data: { tab: 'tabGeneral', data: configs } });
            settingsWindow.webContents.send('fromBackToFront', { action: 'itemSaved', data: { html: '¡Cambios Guardados!' } });
        }
    });
}

async function saveSpaForm(data) {
    if (!(await syncDB.exists('SPA', `nombre='${data.nombre}' AND dominio='${data.dominio}'`))) {
        await syncDB.insert('SPA', `
            '${data.nombre}', 
            '${data.dominio}', 
            '${data.tipo}', 
            '${data.puerto}', 
            '${data.ruta}', 
            '${data.dns}'
        `, `nombre, dominio, tipo, puerto, ruta, dns`);

        spas = await syncDB.selectAll('SPA');

        buildContextMenu();

        settingsWindow.webContents.send('fromBackToFront', { action: 'data', data: { tab: 'tabSPAs', data: spas } });
        settingsWindow.webContents.send('fromBackToFront', { action: 'itemSaved', data: { html: '¡SPA Creada!' } });
    }
}

async function saveEntornoForm(data) {
    if (!(await syncDB.exists('ENTORNO', `nombre='${data.nombre}' AND spa='${data.spa}'`))) {
        await syncDB.insert('ENTORNO', `
            '${data.nombre}', 
            '${data.spa}', 
            '${data.proxyPassAPI}', 
            '${data.proxyPassReverseAPI}', 
            '${data.proxyPassOpenAPI}', 
            '${data.proxyPassReverseOpenAPI}', 
            '${data.proxyPassSites}', 
            '${data.proxyPassReverseSites}'
        `, `nombre, spa, proxyPassAPI, proxyPassReverseAPI, proxyPassOpenAPI, proxyPassReverseOpenAPI, proxyPassSites, proxyPassReverseSites`);

        todosEntornos = await syncDB.selectAll('ENTORNO');

        buildContextMenu();

        settingsWindow.webContents.send('fromBackToFront', { action: 'data', data: { tab: 'tabEntornos', data: todosEntornos } });
        settingsWindow.webContents.send('fromBackToFront', { action: 'itemSaved', data: { html: '¡Entorno Creado!' } });
    }
}

async function saveRecursoForm(data) {
    if (!(await syncDB.exists('RECURSO', `spa='${data.spa}' AND entorno='${data.entorno}' AND credencial1='${data.credencial1}'`))) {
        await syncDB.insert('RECURSO', `
            '${data.nombre}', 
            '${data.spa}', 
            '${data.entorno}', 
            '${data.credencial1}', 
            '${data.tipoCredencial1}', 
            '${data.credencial2}', 
            '${data.tipoCredencial2}'
        `, `nombre, spa, entorno, credencial1, tipoCredencial1, credencial2, tipoCredencial2`);

        todosRecursos = await syncDB.selectAll('RECURSO');

        buildContextMenu();

        settingsWindow.webContents.send('fromBackToFront', { action: 'data', data: { tab: 'tabRecursos', data: todosRecursos } });
        settingsWindow.webContents.send('fromBackToFront', { action: 'itemSaved', data: { html: '¡SPA Creada!' } });
    }
}

app.on('window-all-closed', () => {});

ipcMain.on('fromFrontToBack', (event, arg) => {
    let action = arg.action;
    let data = arg.data;

    switch (action) {
        case 'requestData':
            frontRequestData(data);
            break;
        case 'saveForm':
            frontSaveForm(data);
            break;
        case 'deleteItem':
            deleteItem(data);
            break;
        case 'openExternalURL':
            shell.openExternal(data);
            break;
    }
});

ipcMain.on('app_version', event => {
    event.sender.send('app_version', { version: app.getVersion() });
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

autoUpdater.on('update-available', () => {
    if (settingsWindow) {
        settingsWindow.webContents.send('update_available');
    }
    if (aboutWindow) {
        aboutWindow.webContents.send('update_available');
    }
});

autoUpdater.on('update-downloaded', () => {
    if (settingsWindow) {
        settingsWindow.webContents.send('update_downloaded');
    }
    if (aboutWindow) {
        aboutWindow.webContents.send('update_downloaded');
    }
    updateDownloaded = true;
    buildContextMenu();
});

autoUpdater.on('error', () => {
    let choosed = dialog.showMessageBoxSync({
        title: 'Error durante la descarga de la actualización',
        message: 'La descarga de la actualización ha fallado. \nPor favor, descarga manualmente la nueva versión desde GitHub.',
        type: 'error',
        buttons: [
            'Descarga manual',
            'Cancelar'
        ],
        cancelId: 1
    });

    if (choosed == 0) {
        shell.openExternal('https://github.com/christianlc00/spa-development-helper/releases/latest');
    }
});