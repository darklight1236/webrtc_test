const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const rooms = {
    "main": new Set()
};

io.on("connection", (socket) => {

    console.log("CONNECTED:", socket.id);

    socket.on("join-room", (roomId = "main") => {

        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = new Set();
        }

        rooms[roomId].add(socket.id);

        const users = [...rooms[roomId]];

        console.log("ROOM USERS:", users);

        // отправляем список ВСЕМ в комнате
        io.to(roomId).emit("users", users);
    });

    socket.on("offer", ({ to, offer }) => {
        io.to(to).emit("offer", {
            from: socket.id,
            offer
        });
    });

    socket.on("answer", ({ to, answer }) => {
        io.to(to).emit("answer", {
            from: socket.id,
            answer
        });
    });

    socket.on("candidate", ({ to, candidate }) => {
        io.to(to).emit("candidate", {
            from: socket.id,
            candidate
        });
    });

    socket.on("disconnect", () => {

        console.log("LEFT:", socket.id);

        for (const roomId in rooms) {

            if (rooms[roomId].has(socket.id)) {

                rooms[roomId].delete(socket.id);

                io.to(roomId).emit("user-left", socket.id);
            }
        }
    });

});

server.listen(3000, () => {
    console.log("SERVER RUNNING 3000");
});