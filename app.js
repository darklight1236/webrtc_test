(() => {

    const socket = io();
    const container = document.querySelector(".container");
    const localVideo = document.getElementById("local");

    const peers = {};
    const pending = {};

    let localStream = null;
    let ready = false;

    const ROOM = "main";

    // ─────────────────────────────
    // START CAMERA
    // ─────────────────────────────

    async function start() {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        ready = true;

        socket.emit("join-room", ROOM);
    }

    // ─────────────────────────────
    // CREATE PEER
    // ─────────────────────────────

    function createPeer(id) {

        if (peers[id]) return peers[id];

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        peers[id] = pc;

        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        pc.ontrack = (event) => {

            let wrapper = document.getElementById(`client-${id}`);

            if (!wrapper) {

                wrapper = document.createElement("div");
                wrapper.className = "client";
                wrapper.id = `client-${id}`;

                const video = document.createElement("video");
                video.id = `video-${id}`;
                video.autoplay = true;
                video.playsInline = true;

                wrapper.appendChild(video);
                container.appendChild(wrapper);
            }

            const video = document.getElementById(`video-${id}`);

            if (video && video.srcObject !== event.streams[0]) {
                video.srcObject = event.streams[0];
            }
        };

        pc.onicecandidate = (event) => {

            if (!event.candidate) return;

            socket.emit("candidate", {
                to: id,
                candidate: event.candidate
            });
        };

        pc.onconnectionstatechange = () => {

            if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
                removePeer(id);
            }
        };

        return pc;
    }

    // ─────────────────────────────
    // REMOVE PEER
    // ─────────────────────────────

    function removePeer(id) {

        if (peers[id]) {
            peers[id].close();
            delete peers[id];
        }

        const el = document.getElementById(`client-${id}`);
        if (el) el.remove();

        delete pending[id];
    }

    // ─────────────────────────────
    // USERS
    // ─────────────────────────────

    socket.on("users", (users) => {

        if (!ready) return;

        const self = socket.id;

        users.forEach(id => {
            if (id !== self) createPeer(id);
        });

        if (users[0] !== self) return;

        setTimeout(async () => {

            for (const id of users) {

                if (id === self) continue;

                const pc = peers[id];
                if (!pc) continue;

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                socket.emit("offer", {
                    to: id,
                    offer
                });
            }

        }, 1200);
    });

    // ─────────────────────────────
    // OFFER
    // ─────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        const pc = createPeer(from);

        await pc.setRemoteDescription(offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            to: from,
            answer
        });

        if (pending[from]) {
            for (const c of pending[from]) {
                await pc.addIceCandidate(c);
            }
            delete pending[from];
        }
    });

    // ─────────────────────────────
    // ANSWER
    // ─────────────────────────────

    socket.on("answer", async ({ from, answer }) => {

        const pc = peers[from];
        if (!pc) return;

        await pc.setRemoteDescription(answer);
    });

    // ─────────────────────────────
    // CANDIDATES
    // ─────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];

        if (!pc || !pc.remoteDescription) {

            if (!pending[from]) pending[from] = [];
            pending[from].push(candidate);
            return;
        }

        try {
            await pc.addIceCandidate(candidate);
        } catch (e) {
            console.error(e);
        }
    });

    // ─────────────────────────────
    // START
    // ─────────────────────────────

    start();

})();