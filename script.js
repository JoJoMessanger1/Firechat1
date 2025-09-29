// script.js (FINAL & KORRIGIERT)

import * as P2PManager from './p2p_manager.js';

// --- BASIS-DATENSTRUKTUR & INITIALISIERUNG ---

const myUserID = P2PManager.generateLocalID(); 
let myUserName = localStorage.getItem('myUserName') || "Ich (Noch kein Name festgelegt)";
let activeChatID = null;

function loadData() {
    const contacts = localStorage.getItem('contacts');
    const messages = localStorage.getItem('messages');
    
    return {
        contacts: contacts ? JSON.parse(contacts) : { 
            [myUserID]: { name: myUserName, isGroup: false, p2p_id: myUserID }
        },
        messages: messages ? JSON.parse(messages) : {}
    };
}
let AppData = loadData();

function updateLocalStorage() {
    localStorage.setItem('contacts', JSON.stringify(AppData.contacts));
    localStorage.setItem('messages', JSON.stringify(AppData.messages));
}

function getLastMessage(chatID) {
    const chatMessages = AppData.messages[chatID];
    return chatMessages && chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
}

// --- UI RENDER FUNKTIONEN ---

function renderChatList() {
    const chatListElement = document.getElementById('chat-list');
    chatListElement.innerHTML = '';
    
    // Sortierung nach letzter Nachricht
    const sortedChatIDs = Object.keys(AppData.contacts).sort((idA, idB) => {
        if (idA === myUserID) return 1; 
        if (idB === myUserID) return -1;
        const msgB = getLastMessage(idB);
        const msgA = getLastMessage(idA);
        return (msgB?.timestamp || 0) - (msgA?.timestamp || 0);
    });

    sortedChatIDs.forEach(id => {
        const contact = AppData.contacts[id];
        const lastMessage = getLastMessage(id);

        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatID = id;
        chatItem.innerHTML = `
            <div>
                <strong>${contact.name}</strong> 
                <p style="color:#666; font-size:0.9em;">
                    ${lastMessage ? (lastMessage.senderID === myUserID ? 'Du: ' : '') + lastMessage.text.substring(0, 30) + (lastMessage.text.length > 30 ? '...' : '') : 'Keine Nachrichten'}
                </p>
            </div>
        `;
        chatItem.addEventListener('click', () => {
            activeChatID = id;
            const chatHeader = document.getElementById('chat-header');
            chatHeader.innerHTML = `<span id="current-chat-name">${contact.name}</span>`;
            
            if (contact.isGroup) {
                chatHeader.classList.add('clickable-header');
                chatHeader.onclick = showGroupDetails; 
            } else {
                chatHeader.classList.remove('clickable-header');
                chatHeader.onclick = null;
            }

            renderMessages(id);
        });
        chatListElement.appendChild(chatItem);
    });
}

function renderMessages(chatID) {
    const messagesElement = document.getElementById('messages');
    messagesElement.innerHTML = '';
    
    const chatMessages = AppData.messages[chatID] || [];
    const isGroup = AppData.contacts[chatID]?.isGroup;

    chatMessages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const isSent = msg.senderID === myUserID;
        const senderInfo = AppData.contacts[msg.senderID];
        const senderName = (senderInfo && senderInfo.name !== 'Ich') ? senderInfo.name : msg.senderID;

        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        
        if (!isSent && isGroup) {
            const senderSpan = document.createElement('span');
            senderSpan.textContent = senderName + ': ';
            senderSpan.style.fontWeight = 'bold';
            senderSpan.style.color = '#34B7F1'; 
            messageDiv.appendChild(senderSpan);
        }

        messageDiv.appendChild(document.createTextNode(msg.text));
        messagesElement.appendChild(messageDiv);
    });

    messagesElement.scrollTop = messagesElement.scrollHeight;
}


// --- GRUPPEN-VERBINDUNGSLOGIK (UNVERÄNDERT) ---

// Globale Funktion (Zugriff durch HTML-onclick)
window.showGroupDetails = function() { 
    if (!activeChatID || !AppData.contacts[activeChatID].isGroup) return;

    const group = AppData.contacts[activeChatID];
    let memberListHTML = `<div style="padding: 15px;"><h3>Gruppenmitglieder (${group.name})</h3><p>Verbindungen müssen manuell hergestellt werden, um Nachrichten auszutauschen.</p>`;

    group.members.forEach(memberID => {
        if (memberID === myUserID) {
            memberListHTML += `<p><strong>${myUserName} (Sie) - ID: ${memberID}</strong></p>`;
            return;
        }

        const memberName = AppData.contacts[memberID]?.name || `Unbekannt (${memberID})`;
        const connectionStatus = P2PManager.getConnectionStatus(memberID);
        let statusText = '';
        let buttonText = 'Verbinden';
        let buttonAction = `startP2PForGroupMember('${memberID}', true)`; // True = Initiator

        if (connectionStatus === 'open') {
            statusText = '<span style="color:green; font-weight:bold;">✅ Verbunden</span>';
            buttonText = 'Trennen';
            buttonAction = `closeP2PConnection('${memberID}')`;
        } else if (connectionStatus === 'connecting' || connectionStatus === 'checking') {
            statusText = '<span style="color:orange; font-weight:bold;">⏳ Verbindet...</span>';
            buttonText = 'Code eingeben';
            buttonAction = `startP2PForGroupMember('${memberID}', false)`; // False = Nicht Initiator (Code eingeben)
        } else {
            statusText = '<span style="color:red; font-weight:bold;">❌ Nicht verbunden</span>';
        }

        memberListHTML += `
            <div style="border-bottom: 1px solid #eee; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${memberName}</strong> <br> 
                    <small>ID: ${memberID}</small><br>
                    ${statusText}
                </div>
                <button onclick="event.stopPropagation(); ${buttonAction}" style="padding: 5px 10px; background-color: #075E54; color: white; border: none; border-radius: 5px;">
                    ${buttonText}
                </button>
            </div>
        `;
    });
    memberListHTML += '</div>';

    const chatWindow = document.getElementById('messages');
    chatWindow.innerHTML = memberListHTML;
    
    const chatHeader = document.getElementById('chat-header');
    chatHeader.innerHTML = `<span onclick="renderMessages(activeChatID);" style="cursor:pointer; text-decoration:underline;">Zurück zu ${group.name}</span>`;
    chatHeader.onclick = null; 
}


// Globale Funktion (Zugriff durch HTML-onclick)
window.startP2PForGroupMember = function(partnerID, isInitiator) {
    const handleSignaling = (code) => {
        if (code) {
             // Wichtig: onMessageCallback an handleSignalingCode übergeben
            P2PManager.handleSignalingCode(code, receiveP2PMessage); 
            // Hier sollte showGroupDetails erneut gerendert werden, aber erst nach erfolgreicher Verbindung
        }
    }

    if (isInitiator) {
        P2PManager.createOffer(partnerID, () => {
            alert(`OFFER generiert. Warten Sie auf den ANSWER/KANDIDAT-Code von ${partnerID}.`);
        }, receiveP2PMessage); 
    }
    
    const code = prompt(`Geben Sie den Code (OFFER, ANSWER oder KANDIDAT) von/für ${partnerID} ein.`);
    handleSignaling(code);
    
    // UI sofort aktualisieren (Status sollte auf 'connecting' wechseln)
    showGroupDetails();
}

// Globale Funktion (Zugriff durch HTML-onclick)
window.closeP2PConnection = function(partnerID) {
    P2PManager.closeConnection(partnerID);
    showGroupDetails();
}


// --- AKTIONEN UND KONTAKTVERWALTUNG (KORRIGIERT FÜR FEHLERFREIES PROMPT) ---

function addContactOrGroupPrompt() {
    const idToAdd = prompt("Geben Sie die P2P-ID des Kontakts ein (z.B. P2P-ABC123D).");

    if (!idToAdd || idToAdd.trim() === '' || idToAdd === myUserID) {
        if (idToAdd === myUserID) alert("Das ist Ihre eigene ID!");
        return;
    }

    const defaultName = `Partner (${idToAdd.substring(0, 8)})`; 

    AppData.contacts[idToAdd] = { 
        name: defaultName, 
        isGroup: false, 
        p2p_id: idToAdd 
    };
    
    if (!AppData.messages[idToAdd]) {
        AppData.messages[idToAdd] = [];
    }
    
    updateLocalStorage();
    renderChatList();
    alert(`Kontakt "${defaultName}" erfolgreich hinzugefügt. Sie können den Namen über Option 3 ändern.`);
}

function createNewGroup() {
    const groupName = prompt("Geben Sie den Namen für die neue Gruppe ein (z.B. Projekt-Team 2025).");

    if (!groupName || groupName.trim() === '') {
        alert("Gruppenerstellung abgebrochen. Name fehlt.");
        return;
    }

    const memberIDsInput = prompt("Geben Sie die P2P-IDs der Gruppenmitglieder ein, getrennt durch Komma (,):");

    if (!memberIDsInput || memberIDsInput.trim() === '') {
        alert("Gruppenerstellung abgebrochen. Keine Mitglieder angegeben.");
        return;
    }
    
    let members = memberIDsInput.split(',')
                                .map(id => id.trim())
                                .filter(id => id !== '' && id !== myUserID);
    
    members.push(myUserID); 
    
    const newGroupID = 'GROUP-' + new Date().getTime(); 

    AppData.contacts[newGroupID] = {
        name: groupName,
        isGroup: true,
        members: [...new Set(members)], 
        p2p_id: newGroupID
    };

    if (!AppData.messages[newGroupID]) {
        AppData.messages[newGroupID] = [];
    }
    
    updateLocalStorage();
    renderChatList();
    alert(`Gruppe "${groupName}" mit ${members.length} Mitgliedern erfolgreich erstellt.`);
}

function setUserName() {
    const newName = prompt("Geben Sie Ihren neuen Benutzernamen ein:");
    if (newName && newName.trim() !== '') {
        myUserName = newName.trim();
        localStorage.setItem('myUserName', myUserName);
        // Sicherstellen, dass die eigene ID im Kontakt-Objekt aktualisiert wird
        if (AppData.contacts[myUserID]) {
            AppData.contacts[myUserID].name = myUserName; 
        } else {
            AppData.contacts[myUserID] = { name: myUserName, isGroup: false, p2p_id: myUserID };
        }
        updateLocalStorage();
        document.getElementById('header-username').textContent = myUserName; 
        alert(`Ihr Benutzername wurde auf "${myUserName}" gesetzt.`);
        renderChatList();
    }
}


function startP2PChat() {
    const targetID = prompt("Geben Sie die ID des Partners für den P2P-Austausch ein:");
    if (!targetID || targetID.trim() === '') return;

    // Nur für den Fall, dass der Partner noch nicht als Kontakt hinzugefügt wurde, diesen automatisch hinzufügen
    if (!AppData.contacts[targetID]) {
        addContactOrGroupPrompt(targetID); 
        // Note: Die Funktion oben ist so geschrieben, dass sie nur mit dem Prompt arbeitet, daher kann hier nur der Code durchlaufen werden.
    }

    const action = prompt("Möchten Sie 'OFFER' erstellen (Geben Sie 'O' ein) oder einen Code ('ANSWER'/'KANDIDAT') eingeben (Geben Sie 'E' ein)?").toUpperCase();

    if (action === 'O') {
        P2PManager.createOffer(targetID, (offer) => {
            console.log("Offer generiert, bitte Code manuell austauschen.");
        }, receiveP2PMessage); 
    } else if (action === 'E') {
        const code = prompt("Fügen Sie den vollständigen P2P-Signaling-Code (ANSWER oder KANDIDAT) hier ein:");
        if (code) {
             // Wichtig: onMessageCallback an handleSignalingCode übergeben
            P2PManager.handleSignalingCode(code, receiveP2PMessage); 
        }
    } else {
        alert("Ungültige Auswahl.");
    }
}

// HIER IST DIE FUNKTION, DIE ZUVOR DEFEKT WAR, ABER JETZT KORREKT IST
function showActionMenu() {
    const action = prompt(`Aktionen: 
    1: Kontakt (Einzelchat) per ID hinzufügen
    2: Neue Gruppe erstellen
    3: Benutzernamen festlegen
    4: P2P-Verbindung starten/Code eingeben (NUR EINZELCHAT)
    
    Ihre ID (zum Teilen): ${myUserID}`);

    // Der Switch-Case ist stabiler als if/else-Ketten bei dieser Art von Eingabe
    switch (action) {
        case '1':
            addContactOrGroupPrompt(); 
            break;
        case '2':
            createNewGroup(); 
            break;
        case '3':
            setUserName(); 
            break;
        case '4':
            startP2PChat(); 
            break;
        default:
            if (action) {
                alert("Ungültige Eingabe. Bitte 1, 2, 3 oder 4 eingeben.");
            }
            // Bei Abbruch (action === null) passiert nichts, was korrekt ist
            break;
    }
}


// --- P2P SENDEN UND EMPFANGEN ---

function receiveP2PMessage(senderID, text) {
    const chatID = senderID; // Wir nehmen an, der Absender ist der Chat-Partner

    const receivedMsg = { senderID: senderID, text: text, timestamp: new Date().getTime() };

    // Wenn der Absender ein Gruppenmitglied ist, aber kein Chat existiert, kann das ein Problem sein. 
    // Wir speichern die Nachricht trotzdem unter dem Absender
    if (!AppData.messages[chatID]) {
         // Wir müssen sicherstellen, dass dieser Chat-Partner existiert, falls er nicht als Kontakt hinzugefügt wurde
         if (!AppData.contacts[chatID]) {
            AppData.contacts[chatID] = { name: `Partner (${chatID.substring(0,8)})`, isGroup: false, p2p_id: chatID };
         }
         AppData.messages[chatID] = []; 
    }
    AppData.messages[chatID].push(receivedMsg);
    updateLocalStorage();

    if (chatID === activeChatID) { renderMessages(activeChatID); }
    renderChatList();
}


function sendMessage() {
    const inputElement = document.getElementById('message-input');
    const text = inputElement.value.trim();
    if (text === '' || !activeChatID) return;

    const newMessage = { senderID: myUserID, text: text, timestamp: new Date().getTime() };
    const currentChat = AppData.contacts[activeChatID];

    if (currentChat.isGroup) {
        let successCount = 0;
        currentChat.members.forEach(memberID => {
            if (memberID !== myUserID) {
                const sentToPeer = P2PManager.sendP2PMessage(memberID, text); 
                if (sentToPeer) { successCount++; } 
            }
        });

        if (successCount === 0 && currentChat.members.length > 1) {
             alert("Keine aktiven P2P-Verbindungen zu Gruppenmitgliedern. Nachricht nur lokal gespeichert.");
        }
    } else {
        const sentToPeer = P2PManager.sendP2PMessage(currentChat.p2p_id, text);
        if (!sentToPeer) {
             alert("P2P-Verbindung nicht offen. Starten Sie diese manuell! Nachricht nur lokal gespeichert.");
        }
    }
    
    if (!AppData.messages[activeChatID]) { AppData.messages[activeChatID] = []; }
    AppData.messages[activeChatID].push(newMessage);
    updateLocalStorage();

    renderMessages(activeChatID);
    renderChatList();
    inputElement.value = '';
}


// --- INITIALISIERUNG ---

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('new-chat-btn').addEventListener('click', showActionMenu); 

document.getElementById('header-username').textContent = myUserName; 

// Beim Laden einmal initialisieren
renderChatList();
