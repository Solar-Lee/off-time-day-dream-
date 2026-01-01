const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 設定 Port
const PORT = 3001;
// 強制綁定 IPv4 (解決 macOS localhost 連線問題)
const HOST = '0.0.0.0'; 

const server = http.createServer((req, res) => {
    // 簡單的 Log，讓你知道有沒有連上
    console.log(`[HTTP] ${req.method} ${req.url}`);

    if (req.url === '/') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                console.error(`[錯誤] 找不到 index.html! 請確認檔案在: ${filePath}`);
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('錯誤: 找不到 index.html，請確認檔名是否正確。');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

const rooms = {};
const uuid = () => Math.random().toString(36).substr(2, 9);

wss.on('connection', (ws) => {
    ws.id = uuid();
    let currentRoom = null;
    let currentNick = "Guest";

    // 連線後發送 ID
    ws.send(JSON.stringify({ type: 'welcome', id: ws.id }));

    ws.on('message', (message) => {
        let data;
        try { data = JSON.parse(message); } catch (e) { return; }

        switch (data.type) {
            case 'join':
                handleJoin(data.roomId, data.nickname);
                break;
            case 'signal':
                handleSignal(data);
                break;
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            rooms[currentRoom] = rooms[currentRoom].filter(client => client.id !== ws.id);
            broadcast(currentRoom, { type: 'user-left', id: ws.id }, ws.id);
            if (rooms[currentRoom].length === 0) delete rooms[currentRoom];
        }
    });

    function handleJoin(roomId, nickname) {
        currentRoom = roomId;
        currentNick = nickname || "User";
        if (!rooms[roomId]) rooms[roomId] = [];

        const existingMembers = rooms[roomId].map(c => ({ id: c.id, nickname: c.nickname }));
        ws.send(JSON.stringify({ type: 'room-info', members: existingMembers }));

        rooms[roomId].push({ id: ws.id, ws, nickname: currentNick });
        broadcast(roomId, { type: 'user-joined', id: ws.id, nickname: currentNick }, ws.id);
        
        console.log(`[WebSocket] ${currentNick} 加入了房間 ${roomId}`);
    }

    function handleSignal(data) {
        if (!data.to) return;
        const targetRoom = rooms[currentRoom];
        if (targetRoom) {
            const targetClient = targetRoom.find(c => c.id === data.to);
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                targetClient.ws.send(JSON.stringify({ ...data, from: ws.id }));
            }
        }
    }

    function broadcast(roomId, msg, excludeId) {
        if (!rooms[roomId]) return;
        rooms[roomId].forEach(client => {
            if (client.id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(msg));
            }
        });
    }
});

server.listen(PORT, HOST, () => {
    console.log('---------------------------------------');
    console.log(`✅ 伺服器已啟動！`);
    console.log(`👉 請用瀏覽器開啟: http://127.0.0.1:${PORT}`);
    console.log('---------------------------------------');
});