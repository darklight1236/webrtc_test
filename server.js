const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const rooms = {
    main: new Set()
};

// ─────────────────────────────
// SOCKET
// ─────────────────────────────

io.on("connection", (socket) => {

    console.log("CONNECTED:", socket.id);

    // ───────── JOIN ROOM ─────────

    socket.on("join-room", (roomId = "main") => {

        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = new Set();
        }

        rooms[roomId].add(socket.id);

        const users = Array.from(rooms[roomId]);

        console.log("ROOM USERS:", users);

        io.to(roomId).emit("users", users);
    });

    // ───────── OFFER ─────────

    socket.on("offer", ({ to, offer }) => {

        io.to(to).emit("offer", {
            from: socket.id,
            offer
        });
    });

    // ───────── ANSWER ─────────

    socket.on("answer", ({ to, answer }) => {

        io.to(to).emit("answer", {
            from: socket.id,
            answer
        });
    });

    // ───────── ICE CANDIDATE ─────────

    socket.on("candidate", ({ to, candidate }) => {

        io.to(to).emit("candidate", {
            from: socket.id,
            candidate
        });
    });

    // ───────── DISCONNECT ─────────

    socket.on("disconnect", () => {

        console.log("LEFT:", socket.id);

        for (const roomId in rooms) {

            if (rooms[roomId].has(socket.id)) {

                rooms[roomId].delete(socket.id);

                io.to(roomId).emit("users",
                    Array.from(rooms[roomId])
                );

                io.to(roomId).emit("user-left", socket.id);
            }
        }
    });
});

// ─────────────────────────────
// START SERVER
// ─────────────────────────────

server.listen(3000, () => {
    console.log("SERVER RUNNING ON PORT 3000");
});