(() => {

    const localVideo = document.getElementById("local");
    const container = document.querySelector(".container");
    

    const params = new URLSearchParams(window.location.search);
    const myName = params.get("name") || "User";

    const socket = io();
    const roomId = "test-room";

    let localStream = null;
    let streamReady = false;

    const peers = {};
    const pendingCandidates = {};

    // ───────────────────────────────
    // START STREAM
    // ───────────────────────────────

    async function start() {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        streamReady = true;

        localVideo.srcObject = localStream;
        detectSpeaking(localStream, "local-client");

        socket.emit("join-room", {
            roomId,
            name: myName
        });
    }

    // ───────────────────────────────
    // CREATE PEER
    // ───────────────────────────────

    function createPeer(id, name) {

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                {
                    urls: "turn:82.26.150.172:3478",
                    username: "test",
                    credential: "test123"
                }
            ]
        });

        peers[id] = pc;

        // local tracks
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // create video
        const client = document.createElement("div");
        client.className = "client";
        client.id = `client-${id}`;

        const video = document.createElement("video");

        video.autoplay = true;
        video.playsInline = true;
        video.id = id;

        const username = document.createElement("div");
        username.className = "username";
        username.innerText = name || "User";

        client.appendChild(video);
        client.appendChild(username);

        container.appendChild(client);

        pc.ontrack = (event) => {
            video.srcObject = event.streams[0];

            detectSpeaking(
                event.streams[0],
                `client-${id}`
            );

            setScreenFocus(id);
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
                pc.connectionState === "disconnected" ||
                pc.connectionState === "closed"
            ) {
                cleanupPeer(id);
            }
        };

        return pc;
    }

    // ───────────────────────────────
    // CLEANUP PEER
    // ───────────────────────────────

    function cleanupPeer(id) {

        if (peers[id]) {
            peers[id].close();
            delete peers[id];
        }

        if (pendingCandidates[id]) {
            delete pendingCandidates[id];
        }


        // ДЕНДЖЕРОС!!!! БИ КЭРЭФУЛ!
        // const video = document.getElementById(id);
        // if (video) {
        //     video.srcObject = null;
        //     video.remove();
        // }

        const client = document.getElementById(`client-${id}`);

        if (client) {
            client.remove();
        }

        console.log("CLEANED UP:", id);
    }

    // ───────────────────────────────
    // USERS
    // ───────────────────────────────

    socket.on("users", (users) => {

        if (!streamReady) return;

        users.forEach(user => {

            const { id, name } = user;

            if (id === socket.id) return;
            if (peers[id]) return;

            const pc = createPeer(id, name);

            pc.createOffer()
                .then(o => pc.setLocalDescription(o))
                .then(() => {
                    socket.emit("offer", {
                        to: id,
                        offer: pc.localDescription
                    });
                });
        });
    });

    // ───────────────────────────────
    // OFFER
    // ───────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        if (!peers[from]) {
            createPeer(from);
        }

        const pc = peers[from];

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        flushCandidates(from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            to: from,
            answer
        });
    });

    // ───────────────────────────────
    // ANSWER
    // ───────────────────────────────

    socket.on("answer", async ({ from, answer }) => {

        const pc = peers[from];

        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        flushCandidates(from);
    });

    // ───────────────────────────────
    // ICE
    // ───────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];

        if (!pc) return;

        if (!pc.remoteDescription) {

            if (!pendingCandidates[from]) {
                pendingCandidates[from] = [];
            }

            pendingCandidates[from].push(candidate);
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error(e);
        }
    });

    // ───────────────────────────────
    // FLUSH ICE QUEUE
    // ───────────────────────────────

    function flushCandidates(id) {

        const pc = peers[id];
        if (!pc) return;

        if (pendingCandidates[id]) {
            for (const c of pendingCandidates[id]) {
                pc.addIceCandidate(new RTCIceCandidate(c));
            }
            pendingCandidates[id] = [];
        }
    }

    // ───────────────────────────────
    // USER LEFT
    // ───────────────────────────────

    socket.on("user-left", (id) => {
        cleanupPeer(id);
    });

    socket.on("user-joined", ({ id, name }) => {
        console.log(name + " joined");
        createPeer(id, name);
    });

    function detectSpeaking(stream, clientId) {

    const audioContext = new AudioContext();

    const analyser = audioContext.createAnalyser();

    const microphone =
        audioContext.createMediaStreamSource(stream);

    const dataArray =
        new Uint8Array(analyser.fftSize);

    microphone.connect(analyser);

    function checkAudio() {

        analyser.getByteTimeDomainData(dataArray);

        let volume = 0;

        for (let i = 0; i < dataArray.length; i++) {

            volume += Math.abs(dataArray[i] - 128);
        }

        const speaking = volume > 2500;

        const client = document.getElementById(clientId);

        if (client) {

            if (speaking) {
                client.classList.add("speaking");
            } else {
                client.classList.remove("speaking");
            }
        }

        requestAnimationFrame(checkAudio);
    }

    checkAudio();
}


    // micro\video on\off button
    // ───────────────────────────────
    // CONTROLS
    // ───────────────────────────────

    const micBtn = document.getElementById("micBtn");
    const camBtn = document.getElementById("camBtn");
    const leaveBtn = document.getElementById("leaveBtn");
    const screenBtn = document.getElementById("screenBtn");

    let micEnabled = true;
    let camEnabled = true;

    let screenStream = null;
    let isScreenSharing = false;
    let activeScreenId = null;

    function setScreenFocus(id) {

        document.querySelectorAll(".client").forEach(el => {
            el.classList.remove("screen-active");
        });

        const el = document.getElementById(`client-${id}`);

        if (el) {
            el.classList.add("screen-active");
        }

        activeScreenId = id;
    }

    // MIC
    micBtn.onclick = () => {

        micEnabled = !micEnabled;

        localStream.getAudioTracks().forEach(track => {
            track.enabled = micEnabled;
        });

        micBtn.classList.toggle("off", !micEnabled);
        micBtn.classList.toggle("active", micEnabled);
    };

    // CAMERA
    camBtn.onclick = () => {

        camEnabled = !camEnabled;

        localStream.getVideoTracks().forEach(track => {
            track.enabled = camEnabled;
        });

        camBtn.classList.toggle("off", !camEnabled);
        camBtn.classList.toggle("active", camEnabled);
    };

    leaveBtn.onclick = () => {

        // 1. отключаем стримы
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        // 2. закрываем все peer connections
        Object.values(peers).forEach(pc => pc.close());

        // 3. очищаем UI
        document.querySelectorAll(".client").forEach(el => {
            if (el.id !== "local-client") el.remove();
        });

        // 4. уведомляем сервер
        socket.disconnect();

        // 5. (опционально) закрыть вкладку
        setTimeout(() => {
            // window.location.reload(); // безопаснее чем window.close()
            window.location.href = "/";
        }, 300);
    };

    // SCREEN ON
    screenBtn.onclick = async () => {

        try {

            if (!isScreenSharing) {

                // ─────────────────────
                // START SCREEN SHARE
                // ─────────────────────

                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });

                const screenTrack = screenStream.getVideoTracks()[0];

                // заменяем видео у всех peers
                Object.values(peers).forEach(pc => {

                    const sender = pc.getSenders().find(s =>
                        s.track && s.track.kind === "video"
                    );

                    if (sender) {
                        sender.replaceTrack(screenTrack);
                    }

                });

                // локальный preview
                localVideo.srcObject = screenStream;

                isScreenSharing = true;
                screenBtn.classList.add("presenting");

                // если пользователь нажал "Stop sharing" в браузере
                screenTrack.onended = stopScreenShare;
            }

            else {
                stopScreenShare();
            }

        } catch (err) {
            console.error("SCREEN SHARE ERROR:", err);
        }
    };

    async function stopScreenShare() {

        if (!localStream) return;

        const cameraTrack = localStream.getVideoTracks()[0];

        Object.values(peers).forEach(pc => {

            const sender = pc.getSenders().find(s =>
                s.track && s.track.kind === "video"
            );

            if (sender) {
                sender.replaceTrack(cameraTrack);
            }

        });

        localVideo.srcObject = localStream;

        isScreenSharing = false;
        screenBtn.classList.remove("presenting");

        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            screenStream = null;
        }

        document.querySelectorAll(".client").forEach(el => {
            el.classList.remove("screen-active");
        });
    }

    start();

})();