const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// سرو فایل‌های استاتیک
app.use(express.static(path.join(__dirname, 'public')));

// ذخیره‌سازی داده‌ها
const waitingPlayers = [];
const activeGames = new Map();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('🔗 بازیکن جدید متصل شد:', socket.id);

    socket.on('join-waiting', (playerData) => {
        const playerInfo = {
            socketId: socket.id,
            playerName: playerData.name || `بازیکن${waitingPlayers.length + 1}`,
            joinedAt: new Date()
        };
        
        waitingPlayers.push(playerInfo);
        
        // اطلاع به بازیکن
        socket.emit('waiting-status', { 
            position: waitingPlayers.length,
            totalPlayers: waitingPlayers.length
        });
        
        // بروزرسانی لیست برای همه
        updateWaitingList();
        
        console.log(`🎯 ${playerInfo.playerName} به صف اضافه شد. تعداد: ${waitingPlayers.length}`);
        
        // اگر 4 بازیکن شدند، بازی جدید بساز
        if (waitingPlayers.length >= 4) {
            createNewGame();
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ بازیکن قطع شد:', socket.id);
        removePlayerFromWaiting(socket.id);
        updateWaitingList();
    });

    // مدیریت حرکات بازی
    socket.on('game-action', (data) => {
        console.log('🎮 حرکت بازی:', data);
        const game = activeGames.get(data.roomId);
        if (game) {
            // ارسال حرکت به همه بازیکنان
            socket.to(data.roomId).emit('game-update', data);
        }
    });

    function removePlayerFromWaiting(socketId) {
        const index = waitingPlayers.findIndex(p => p.socketId === socketId);
        if (index !== -1) {
            waitingPlayers.splice(index, 1);
        }
    }

    function updateWaitingList() {
        io.emit('waiting-players-update', {
            players: waitingPlayers.map(p => p.playerName),
            count: waitingPlayers.length
        });
    }

    function createNewGame() {
        const roomId = 'game_' + Date.now();
        const players = waitingPlayers.splice(0, 4);
        
        const game = {
            id: roomId,
            players: players.map((player, index) => ({
                ...player,
                color: ['قرمز', 'آبی', 'سبز', 'زرد'][index],
                colorCode: ['red', 'blue', 'green', 'yellow'][index]
            })),
            gameState: {
                turn: 0,
                dice: 0,
                startedAt: new Date()
            }
        };
        
        activeGames.set(roomId, game);
        
        // اضافه کردن بازیکنان به اتاق
        players.forEach(player => {
            const playerSocket = io.sockets.sockets.get(player.socketId);
            if (playerSocket) {
                playerSocket.join(roomId);
                
                playerSocket.emit('game-started', {
                    roomId: roomId,
                    players: game.players,
                    yourColor: game.players.find(p => p.socketId === player.socketId).color,
                    yourColorCode: game.players.find(p => p.socketId === player.socketId).colorCode
                });
            }
        });
        
        // اطلاع شروع بازی به همه
        io.to(roomId).emit('game-state-update', game.gameState);
        
        console.log(`🎲 بازی جدید ایجاد شد: ${roomId} با ${players.length} بازیکن`);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 سرور اجرا شد روی پورت ${PORT}`);
    console.log(`📱 آدرس: http://localhost:${PORT}`);
});
