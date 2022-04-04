const { ipcRenderer } = require('electron');

let currentTab = 'tabGeneral';
let settings,
    updateIcon,  
    tabs,   
    createModals, 
    viewModal,
    editModal,
    deleteModal,
    tabsInstance,
    createModalsInstances,
    viewModalInstance,
    editModalInstance,
    deleteModalInstance;

document.addEventListener('DOMContentLoaded', () => {
    M.Modal.init(document.querySelectorAll('.modal'), {
        preventScrolling: true
    });

    M.Tabs.init(document.getElementById('tabs'), {});

    M.FormSelect.init(document.querySelectorAll('select'), {});

    updateIcon = document.getElementById('updateIcon');

    createModals = {};

    tabs = document.getElementById('tabs');
    createModals.createModalSpa = document.getElementById('createModalSpa');
    createModals.createModalEntorno = document.getElementById('createModalEntorno');
    createModals.createModalRecurso = document.getElementById('createModalRecurso');

    viewModal = document.getElementById('viewModal');
    editModal = document.getElementById('editModal');
    deleteModal = document.getElementById('deleteModal');

    createModalsInstances = {};

    tabsInstance = M.Tabs.getInstance(tabs);
    createModalsInstances.createModalSpa = M.Modal.getInstance(createModals.createModalSpa);
    createModalsInstances.createModalEntorno = M.Modal.getInstance(createModals.createModalEntorno);
    createModalsInstances.createModalRecurso = M.Modal.getInstance(createModals.createModalRecurso);

    let closeModalBtns = [
        {
            instance: createModalsInstances.createModalSpa,
            elements: ['createModalSpa-btn1', 'createModalSpa-btn2']
        },
        {
            instance: createModalsInstances.createModalEntorno,
            elements: ['createModalEntorno-btn1', 'createModalEntorno-btn2']
        },
        {
            instance: createModalsInstances.createModalRecurso,
            elements: ['createModalRecurso-btn1', 'createModalRecurso-btn2']
        },
    ];

    addCloseModalEventListeners(closeModalBtns);

    viewModalInstance = M.Modal.getInstance(viewModal);
    editModalInstance = M.Modal.getInstance(editModal);
    deleteModalInstance = M.Modal.getInstance(deleteModal);

    let saveBtn = document.getElementById('saveBtn');
    saveBtn.addEventListener('click', event => {
        saveBtn.classList.add('icon-rotating');
        saveBtn.getElementsByTagName('i')[0].innerHTML = 'autorenew';
        sendDataForm('generalSettingsForm', 'general');
    });

    M.AutoInit();

    ipcRenderer.on('fromBackToFront', (event, arg) => {
        let action = arg.action;
        let data = arg.data;

        switch (action) {
            case 'data':
                receiveData(data);
                break;
            case 'allData':
                receiveAllData(data);
                break;
            case 'itemSaved':
                saveBtn.classList.remove('icon-rotating');
                saveBtn.getElementsByTagName('i')[0].innerHTML = 'save';
                showToast(data);
                break;
            case 'itemDeleted':
                itemDeleted(data);
                break;
            case 'openModal':
                receiveAllData(data);
                openModalFromElectron(data);
                break;
        }
    });
});

function addCloseModalEventListeners(closeModalBtns) {
    closeModalBtns.forEach(closeModalBtn => {
        closeModalBtn.elements.forEach(element => {
            document.getElementById(element).addEventListener('click', () => {
                closeModalBtn.instance.close();
            });
        });
    });
}

function openModalFromElectron(arg){
    let dataTab = arg.tab;

    switch (dataTab) {
        case 'tabSPAs':
            tabsInstance.select('tabSPAs');
            createModalsInstances.createModalSpa.open();
            break;
        case 'tabEntornos':
            tabsInstance.select('tabEntornos');
            modalCreateEntornoUpdateSelects();
            createModalsInstances.createModalEntorno.open();
            break;
        case 'tabRecursos':
            tabsInstance.select('tabRecursos');
            modalCreateRecursoUpdateSelectSPA();
            createModalsInstances.createModalRecurso.open();
            break;
    }
}

function itemDeleted(data) {
    receiveData(data);
    showToast(data);
}

function newRow(table, type, object, columns) {
    let htmlBotones;
    let element = document.getElementById(table);

    let row = document.createElement('tr');

    element.appendChild(row);

    columns.forEach(column => {
        let td = `<td class="center-align">${column}</td>`;
        row.innerHTML = row.innerHTML + td;
    });

    let tdBotones = document.createElement('td');

    row.appendChild(tdBotones);

    htmlBotones = `
        <button class="btn-view btn-flat waves-effect waves-orange">
            <i class="material-icons">remove_red_eye</i>
        </button>
        <button class="btn-delete btn-flat waves-effect waves-orange">
            <i class="material-icons">delete</i>
        </button>
    `;

    tdBotones.innerHTML = htmlBotones;

    tdBotones.classList.add('center-align');

    tdBotones.getElementsByClassName('btn-view')[0].addEventListener('click', () => {
        openModal("viewModal", type, object);
    });
    tdBotones.getElementsByClassName('btn-delete')[0].addEventListener('click', () => {
        openModal("deleteModal", type, object);
    });
}

function buildTable(table) {
    let element = document.getElementById(table);
    element.innerHTML = '';

    switch (table) {
        case 'spaTableList':
            settings.spas.forEach(spa => {
                newRow('spaTableList', 'spa', spa, [spa.nombre, spa.tipo]);
            });
            break;
        case 'entornosTableList':
            settings.entornos.forEach(entorno => {
                entorno.spa = settings.spas.filter(spa => entorno.spa == spa.codigo)[0];
                newRow('entornosTableList', 'entorno', entorno, [entorno.spa.nombre, entorno.nombre]);
            });
            break;
        case 'recursosTableList':
            settings.recursos.forEach(recurso => {
                recurso.spa = settings.spas.filter(spa => recurso.spa == spa.codigo)[0];
                recurso.entorno = settings.entornos.filter(entorno => recurso.entorno == entorno.codigo)[0];
                newRow('recursosTableList', 'recurso', recurso, [recurso.nombre, recurso.spa.nombre, recurso.entorno.nombre]);
            });
            break;
    }
}

function receiveAllData(data) {
    settings = {};
    settings.configs = data.configs;
    settings.spas = data.spas;
    settings.entornos = data.entornos;
    settings.recursos = data.recursos;

    generalSettingsForm();
    buildTable('spaTableList');
    buildTable('entornosTableList');
    buildTable('recursosTableList');
}

function receiveData(arg) {
    let dataTab = arg.tab;
    let data = arg.data;
    switch (dataTab) {
        case 'tabGeneral':
            settings.configs = data;
            generalSettingsForm();
            break;
        case 'tabSPAs':
            settings.spas = data;
            buildTable('spaTableList');
            break;
        case 'tabEntornos':
            settings.entornos = data;
            buildTable('entornosTableList');
            break;
        case 'tabRecursos':
            settings.recursos = data;
            buildTable('recursosTableList');
            break;
    }
}

function generalSettingsForm() {
    settings.configs.forEach(config => {
        let element = document.getElementById(config.clave);
        if (element) {
            switch(element.type){
                case 'checkbox':
                    element.checked = (config.valor == 'true')? true : false;
                    break;
                case 'text':
                default:
                    element.value = config.valor;
                    break;
            }
        }
    });
}

function disableButton(sendBtnName){
    let sendBtn = document.getElementById(sendBtnName);
    sendBtn.setAttribute('disabled','');
}

function manageDataForm(formID, sendBtnName){
    let formulario = document.getElementById(formID);

    let inputs = formulario.getElementsByTagName('input');
    let selects = formulario.getElementsByTagName('select');
    let sendBtn = document.getElementById(sendBtnName);
    sendBtn.setAttribute('disabled','');

    let allFilled = false;
    let inputsFilled = false;
    let selectsFilled = false;

    
    for (let i = 0; i < inputs.length; i++) {
        if (!inputs[i].classList.contains('select-dropdown') || !inputs[i].classList.contains('dropdown-trigger')) {
            if(inputs[i].value !== ''){
                inputsFilled = true;
            }else{
                inputsFilled = false;
            }
        }
    }
    
    for (let i = 0; i < selects.length; i++) {
        if(selects[i].value !== ''){
            selectsFilled = true;
        }
        else{
            selectsFilled = false;
        }
    }

    (inputsFilled && selectsFilled)? allFilled = true : allFilled = false;
    if(allFilled){
        sendBtn.removeAttribute('disabled');
    }else{
        sendBtn.setAttribute('disabled','');
    }
}

function sendDataForm(formID, tipo) {
    let formulario = document.getElementById(formID);

    let sendData = {};

    let inputs = formulario.getElementsByTagName('input');
    let selects = formulario.getElementsByTagName('select');

    let headerKeys = [], headerValues = [];

    for (let i = 0; i < inputs.length; i++) {
        if (
            !inputs[i].classList.contains('select-dropdown') &&
            !inputs[i].classList.contains('dropdown-trigger') &&
            !inputs[i].classList.contains('header')
        ) {
            switch(inputs[i].type){
                case 'checkbox':
                    sendData[inputs[i].name] = inputs[i].checked? 'true':'false';
                    break;
                case 'text':
                default:
                    sendData[inputs[i].name] = inputs[i].value;
                    break;
            }
            inputs[i].value = '';
        } else if (inputs[i].classList.contains('header')) {
            if (inputs[i].classList.contains('headerKey')) {
                headerKeys.push(inputs[i].value);
            } else if (inputs[i].classList.contains('headerValue')) {
                headerValues.push(inputs[i].value);
            }
        }
    }

    if (headerKeys.length > 0 && headerValues.length > 0 && headerKeys.length == headerValues.length) {
        sendData.headers = {};

        for(let i = 0; i < headerKeys.length; i++) {
            sendData.headers[headerKeys[i]] = headerValues[i];
        }
    }

    for (let i = 0; i < selects.length; i++) {
        sendData[selects[i].getAttribute('name')] = selects[i].value;
        selects[i].value = '';
    }

    ipcRenderer.send('fromFrontToBack', {
        action: 'saveForm',
        data: {
            type: tipo,
            data: sendData
        }
    });
}

function showToast(data) {
    M.toast({ html: data.html });
}

function openModal(nombre, tipo, datos = null) {
    switch (nombre) {
        case 'viewModal':
            gestionaModalView(nombre, tipo, datos);
            break;
        case 'editModal':
            gestionaModalEdit(nombre, tipo, datos);
            break;
        case 'deleteModal':
            gestionaModalDelete(nombre, tipo, datos);
            break;
    }
}

function gestionaModalView(nombre, tipo, datos) {
    let modal = document.getElementById(nombre);
    let contenido = modal.getElementsByClassName('modal-content')[0];

    let form = contenido.getElementsByClassName('form-content')[0];
    let omisiones = ['id', 'codigo'];
    contenido.getElementsByTagName('h4')[0].innerText = 'VER ' + tipo.toUpperCase();

    rellenaModalForm(form, nombre, datos, omisiones);

    document.getElementById('viewModal-btn1').addEventListener('click', () => {
        viewModalInstance.close();
    });

    viewModalInstance.open();
}

function gestionaModalEdit(nombre, tipo, datos) {
    let modal = document.getElementById(nombre);
    let contenido = modal.getElementsByClassName('modal-content')[0];

    let form = contenido.getElementsByClassName('form-content')[0];
    let omisiones = ['id', 'codigo'];

    contenido.getElementsByTagName('h4')[0].innerText = 'EDITAR ' + tipo.toUpperCase();
    rellenaModalForm(form, nombre, datos, omisiones);

    document.getElementById('editModal-btn1').addEventListener('click', () => {
        editModalInstance.close();
    });
    document.getElementById('editModal-btn2').addEventListener('click', () => {
        editModalInstance.close();

        ipcRenderer.send('fromFrontToBack', {
            action: 'editItem',
            data: {
                type: tipo,
                data: datos
            }
        })
    });
    editModalInstance.open();
}

function rellenaModalForm(form, nombreModal, datos, omisiones) {
    let campos = Object.entries(datos);
    let html = '';

    for (let i = 0; i < campos.length; i++) {
        let omitir = false;
        omisiones.forEach(omision => {
            if (campos[i][0] == omision)
                omitir = true;
        })

        if (!omitir) {
            if (campos[i][0] == 'headers') {
                let tableHTML = `
                    <table class="striped">
                        <thead>
                            <tr>
                                <th>Header</th>
                                <th>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                let headers = Object.entries(campos[i][1]);
                for (let e = 0; e < headers.length; e++) {
                    tableHTML += `
                        <tr>
                            <td>${headers[e][0]}</td>
                            <td>${headers[e][1]}</td>
                        </tr>
                    `;
                }
                tableHTML += `
                        </tbody>
                    </table>
                `;
                html += tableHTML;
            } else if (campos[i][1].nombre) {
                html += `
                <div class="row">
                    <div class="input-field col s12">
                        <input name="${campos[i][0]}" type="text" placeholder="${('' + campos[i][0]).toLowerCase()}" value="${campos[i][1].nombre}">
                        <label for="${campos[i][0]}" class="active">${('' + campos[i][0]).replace(/^\w/, (c) => c.toUpperCase())}</label>
                    </div>
                </div>
            `;
            } else {
                html += `
                    <div class="row">
                        <div class="input-field col s12">
                            <input name="${campos[i][0]}" type="text" placeholder="${('' + campos[i][0]).toLowerCase()}" value="${campos[i][1]}">
                            <label for="${campos[i][0]}" class="active">${('' + campos[i][0]).replace(/^\w/, (c) => c.toUpperCase())}</label>
                        </div>
                    </div>
                `;
            }
        }
    }

    form.innerHTML = html;

    let inputsField = form.getElementsByTagName('input');

    if (nombreModal === 'viewModal') {
        for (let i = 0; i < inputsField.length; i++) {
            inputsField[i].setAttribute("disabled", "");
        }
    }
}

function gestionaModalDelete(nombre, tipo, datos) {
    let modal = document.getElementById(nombre).childNodes;
    let contenido = modal[1].childNodes;

    contenido[1].innerText = 'DELETE ' + tipo.toUpperCase();
    contenido[3].innerText = '¿Seguro que quieres borrar ' + datos.nombre + '?';

    document.getElementById('deleteModal-btn1').addEventListener('click', () => {
        deleteModalInstance.close();
    });
    document.getElementById('deleteModal-btn2').addEventListener('click', () => {
        deleteModalInstance.close();
        ipcRenderer.send('fromFrontToBack', {
            action: 'deleteItem',
            data: {
                type: tipo,
                data: datos
            }
        })
    });
    deleteModalInstance.open();
}

function cerrarModal(nombre) {
    switch (nombre) {
        case 'viewModal':
            viewModalInstance.close();
            break;
        case 'editModal':
            editModalInstance.close();
            break;
        case 'deleteModal':
            deleteModalInstance.close();
            break;
    }
}

function modalCreateEntornoUpdateSelects() {
    let select = document.getElementById('createModalEntorno_selectSpa');
    
    let html = '<option value="" disabled selected>Elija una opción</option>';

    settings.spas.forEach(spa => {
        html += `<option value="${spa.codigo}">${spa.nombre}</option>`
    });
    
    select.innerHTML = html;

    M.FormSelect.init(document.querySelectorAll('select'), {});
}

function modalCreateRecursoUpdateSelectSPA() {
    let select = document.getElementById('createModalRecurso_selectSpa');
    let table = document.getElementById('createModalRecurso_tableHeaders');
    let html = '<option value="" disabled selected>Elija una opción</option>';
    settings.spas.forEach(spa => {
        html += `<option value="${spa.codigo}">${spa.nombre}</option>`
    });
    select.innerHTML = html;
    table.innerHTML = ''; 

    M.FormSelect.init(document.querySelectorAll('select'), {});
}

function modalCreateRecursoUpdateSelectEntorno() {
    let spaSelected = document.getElementById('createModalRecurso_selectSpa').value;
    let selectEntorno = document.getElementById('createModalRecurso_selectEntorno');
    
    if (spaSelected != '') {
        let html = '<option value="" disabled selected>Elija una opción</option>';
        let entornosSelect = settings.entornos.filter(ent => ent.codigo == spaSelected);
        entornosSelect.forEach(ent => {
            html += `<option value="${ent.codigo}">${ent.nombre}</option>`
        });
        selectEntorno.innerHTML = html;
    } else {
        let html = '<option value="" disabled selected>Seleccione primero una SPA</option>';
        selectEntorno.innerHTML = html;
    }

    M.FormSelect.init(document.querySelectorAll('select'), {});
}

function addHeaderRow(element, key = '', value = '') {
    let rows = element.parentNode.parentNode.parentNode.parentNode.parentNode.getElementsByTagName('tbody')[0];
    let row = document.createElement('tr');
    row.innerHTML = `
    <td>
        <div class="input-field col s12">
            <input name="clave[]" class="header headerKey" type="text" value=${key}>
        </div>
    </td>
    <td>
        <div class="input-field col s12">
            <input name="valor[]" class="header headerValue" type="text" value=${value}>
        </div>
    </td>
    <td>
        <div class="col s12 center-align">
            <button class="waves-effect waves-teal btn-flat" onclick="delHeaderRow(this);">
                <i class="material-icons">delete</i>
            </button>
        </div>
    </td>
    `;
    rows.appendChild(row)
}

function addRecommendedHeadersRows(element) {
    let recommendedHeaders;

    let selectedSPACode = element.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.querySelector('select[name="spa"]').value;

    let template = settings.spas.filter(spa => spa.codigo == selectedSPACode)[0].tipo;
    console.log(template);

    if (template == 'APACHE_VHOSTS') {
        recommendedHeaders = [
            {
                key: 'X-WASSUP-CRED-USED',
                value: ''
            },
            {
                key: 'X-WASSUP-CREDTYPE-USED',
                value: ''
            },
            {
                key: 'X-WASSUP-PA2',
                value: ''
            },
            {
                key: 'X-WASSUP-PA1',
                value: ''
            },
            {
                key: 'X-WASSUP-LRA',
                value: 'MassMarketMobileUser'
            }
        ];
    } else {
        recommendedHeaders = [
            {
                key: 'loginType',
                value: 'MSISDN'
            },
            {
                key: 'site',
                value: ''
            },
            {
                key: 'rol',
                value: 'MassMarketFixUser,MassMarketMobileUser'
            },
            {
                key: 'sfid',
                value: '17000000'
            },
            {
                key: 'zrol',
                value: 'eRES'
            },
            {
                key: 'privacy',
                value: 'private'
            },
            {
                key: 'zlogin',
                value: 'PAN_PDV'
            }
        ];
    }
    recommendedHeaders.forEach(header => {
        addHeaderRow(element, header.key, header.value);
    });
}

function delHeaderRow(element) {
    let row = element.parentNode.parentNode.parentNode;

    row.parentNode.removeChild(row);
}

ipcRenderer.send('app_version');

ipcRenderer.on('app_version', (event, arg) => {
    ipcRenderer.removeAllListeners('app_version');
});

ipcRenderer.on('update_downloaded', () => {
    ipcRenderer.removeAllListeners('update_downloaded');
    updateIcon.classList.remove('hide');
});

function restartApp() {
    ipcRenderer.send('restart_app');
}