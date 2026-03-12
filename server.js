const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WatchChat Server Running');
});

const wss = new WebSocket.Server({ server });

// rooms: { roomName: Set<{ws, nickname}> }
const rooms = {};

function getOrCreateRoom(roomName) {
    if (!rooms[roomName]) rooms[roomName] = new Set();
    return rooms[roomName];
}

function generateNickname() {
    const adjectives = ['מהיר', 'חכם', 'אמיץ', 'שקט', 'חזק', 'נחמד', 'מצחיק', 'ירוק', 'כחול', 'אדום'];
    const nouns = ['ארנב', 'דב', 'שועל', 'נמר', 'אריה', 'פיל', 'כלב', 'חתול', 'עורב', 'נשר'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}_${noun}`;
}

function broadcastToRoom(roomName, message, excludeWs = null) {
    const room = rooms[roomName];
    if (!room) return;
    const data = JSON.stringify(message);
    room.forEach(client => {
        if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    });
}

function getRoomList() {
    return Object.keys(rooms).map(name => ({
        name,
        count: rooms[name].size
    }));
}

wss.on('connection', (ws) => {
    let currentRoom = null;
    let nickname = generateNickname();

    ws.send(JSON.stringify({
        type: 'welcome',
        nickname,
        rooms: getRoomList()
    }));

    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            return;
        }

        switch (msg.type) {

            case 'get_rooms':
                ws.send(JSON.stringify({
                    type: 'room_list',
                    rooms: getRoomList()
                }));
                break;

            case 'join':
                // Leave current room
                if (currentRoom && rooms[currentRoom]) {
                    rooms[currentRoom].forEach(c => {
                        if (c.ws === ws) rooms[currentRoom].delete(c);
                    });
                    broadcastToRoom(currentRoom, {
                        type: 'system',
                        text: `${nickname} עזב את החדר`
                    });
                    if (rooms[currentRoom].size === 0) delete rooms[currentRoom];
                }

                // Join new room
                const roomName = msg.room.trim().slice(0, 30);
                if (!roomName) break;
                currentRoom = roomName;
                const room = getOrCreateRoom(roomName);
                room.add({ ws, nickname });

                ws.send(JSON.stringify({
                    type: 'joined',
                    room: roomName,
                    nickname,
                    count: room.size
                }));

                broadcastToRoom(roomName, {
                    type: 'system',
                    text: `${nickname} הצטרף לחדר`
                }, ws);
                break;

            case 'message':
                if (!currentRoom) break;
                const text = (msg.text || '').trim().slice(0, 200);
                if (!text) break;

                const chatMsg = {
                    type: 'message',
                    from: nickname,
                    text,
                    time: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                };

                // Send to everyone in room including sender
                const roomMembers = rooms[currentRoom];
                if (roomMembers) {
                    const dataStr = JSON.stringify(chatMsg);
                    roomMembers.forEach(client => {
                        if (client.ws.readyState === WebSocket.OPEN) {
                            client.ws.send(dataStr);
                        }
                    });
                }
                break;

            case 'create_room':
                const newRoom = (msg.room || '').trim().slice(0, 30);
                if (!newRoom) break;
                getOrCreateRoom(newRoom);
                ws.send(JSON.stringify({
                    type: 'room_list',
                    rooms: getRoomList()
                }));
                break;
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom].forEach(c => {
                if (c.ws === ws) rooms[currentRoom].delete(c);
            });
            broadcastToRoom(currentRoom, {
                type: 'system',
                text: `${nickname} התנתק`
            });
            if (rooms[currentRoom] && rooms[currentRoom].size === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`WatchChat server running on port ${PORT}`);
});
