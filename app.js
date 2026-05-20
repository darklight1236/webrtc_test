(() => {

    const socket = io();

    const roomId = "main";

    const container =
        document.querySelector(".container");

    const localVideo =
        document.getElementById("local");

    let localStream;

    const peers = {};

    let isInitiator = false;

    // ─────────────────────────────
    // START
    // ─────────────────────────────

    async function start() {

        localStream =
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

        localVideo.srcObject = localStream;

        socket.emit("join-room", roomId);
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

        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        pc.ontrack = (event) => {

            let video =
                document.getElementById(`video-${id}`);

            if (!video) {

                const div =
                    document.createElement("div");

                div.className = "client";
                div.id = `client-${id}`;

                video =
                    document.createElement("video");

                video.id = `video-${id}`;
                video.autoplay = true;
                video.playsInline = true;

                div.appendChild(video);
                container.appendChild(div);
            }

            video.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {

            if (event.candidate) {

                socket.emit("candidate", {
                    to: id,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {

            if (
                pc.connectionState === "failed" ||
                pc.connectionState === "closed"
            ) {
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

        const el =
            document.getElementById(`client-${id}`);

        if (el) el.remove();
    }

    // ─────────────────────────────
    // USERS LIST (ВАЖНО ИСПРАВЛЕНИЕ)
    // ─────────────────────────────

    socket.on("users", async (users) => {

        // создаём всех peers заранее
        users.forEach(id => {

            if (id !== socket.id) {
                createPeer(id);
            }
        });

        // только ПЕРВЫЙ пользователь создаёт offers
        isInitiator =
            users[0] === socket.id;

        if (!isInitiator) return;

        setTimeout(async () => {

            for (const id of users) {

                if (id === socket.id) continue;

                const pc = peers[id];

                const offer =
                    await pc.createOffer();

                await pc.setLocalDescription(offer);

                socket.emit("offer", {
                    to: id,
                    offer
                });
            }

        }, 1000);
    });

    // ─────────────────────────────
    // OFFER
    // ─────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        const pc = createPeer(from);

        await pc.setRemoteDescription(offer);

        const answer =
            await pc.createAnswer();

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
    // CANDIDATE
    // ─────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];

        if (!pc) return;

        try {
            await pc.addIceCandidate(candidate);
        } catch (e) {
            console.error(e);
        }
    });

    // ─────────────────────────────
    // USER LEFT
    // ─────────────────────────────

    socket.on("user-left", (id) => {
        removePeer(id);
    });

    start();

})();