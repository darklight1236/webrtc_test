(() => {

    const socket = io();
    const container = document.querySelector(".container");
    const localVideo = document.getElementById("local");

    const peers = {};
    const pendingCandidates = {};

    let localStream = null;
    let ready = false;

    const ROOM = "main";

    // ─────────────────────────────
    // START
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

        // LOCAL STREAM (ВАЖНО: только если ready)
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }

        pc.ontrack = (event) => {

            let video = document.getElementById(`video-${id}`);

            if (!video) {

                const div = document.createElement("div");
                div.className = "client";
                div.id = `client-${id}`;

                video = document.createElement("video");
                video.id = `video-${id}`;
                video.autoplay = true;
                video.playsInline = true;

                div.appendChild(video);
                container.appendChild(div);
            }

            video.srcObject = event.streams[0];
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
    // REMOVE
    // ─────────────────────────────

    function removePeer(id) {

        if (peers[id]) {
            peers[id].close();
            delete peers[id];
        }

        const el = document.getElementById(`client-${id}`);
        if (el) el.remove();

        delete pendingCandidates[id];
    }

    // ─────────────────────────────
    // USERS
    // ─────────────────────────────

    socket.on("users", async (users) => {

        if (!ready) return;

        const self = socket.id;

        users.forEach(id => {
            if (id !== self) createPeer(id);
        });

        // только первый инициирует
        if (users[0] !== self) return;

        // ЖДЁМ СТАБИЛЬНОСТЬ STREAM
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

        }, 1500);
    });

    // ─────────────────────────────
    // OFFER
    // ─────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        const pc = createPeer(from);

        await pc.setRemoteDescription(offer);

        // обработка накопленных ICE
        if (pendingCandidates[from]) {

            for (const c of pendingCandidates[from]) {
                await pc.addIceCandidate(c);
            }

            delete pendingCandidates[from];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            to: from,
            answer
        });
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
    // CANDIDATE (КРИТИЧЕСКИ ИСПРАВЛЕНО)
    // ─────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];

        if (!pc || !pc.remoteDescription) {

            if (!pendingCandidates[from]) {
                pendingCandidates[from] = [];
            }

            pendingCandidates[from].push(candidate);
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