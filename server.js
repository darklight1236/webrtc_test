const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname)));

// 1. СОЗДАЕМ ХРАНИЛИЩЕ ИМЕН
const usersMap = {}; 

io.on("connection", (socket) => {

    // 2. ТЕПЕРЬ МЫ ПРИНИМАЕМ НЕ ПРОСТО СТРОКУ, А ОБЪЕКТ С ИМЕНЕМ
    socket.on("join-room", ({ roomId, name }) => {
        socket.join(roomId);

        // Запоминаем имя по socket.id
        usersMap[socket.id] = name || "Guest";

        // Собираем список участников: теперь это массив объектов [{id, name}, ...]
        const clientsArray = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
        const usersWithNames = clientsArray.map(id => ({
            id: id,
            name: usersMap[id]
        }));

        // Отправляем новенькому список всех, кто уже в комнате (с именами)
        socket.emit("users", usersWithNames);

        // Уведомляем остальных, что зашел новенький (передаем его id и имя)
        socket.to(roomId).emit("user-joined", { id: socket.id, name: usersMap[socket.id] });
    });

    socket.on("offer", ({ to, offer }) => {
        io.to(to).emit("offer", { from: socket.id, offer });
    });

    socket.on("answer", ({ to, answer }) => {
        io.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("candidate", ({ to, candidate }) => {
        io.to(to).emit("candidate", { from: socket.id, candidate });
    });

    socket.on("disconnect", () => {
        // Очищаем память и уведомляем об уходе
        delete usersMap[socket.id]; 
        socket.broadcast.emit("user-disconnected", socket.id);
    });
});

server.listen(3000, () => {
    console.log("Server running on 3000");
});