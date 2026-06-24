(() => {

    const localVideo = document.getElementById("local");
    const container = document.querySelector(".container");

    const socket = io({
        transports: ['websocket']
    });
    const roomId = "test-room";

    let localStream = null;
    let streamReady = false;

    const peers = {};
    const pendingCandidates = {};

    // ───────────────────────────────
    // START
    // ───────────────────────────────

    async function start() {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        streamReady = true;

        localVideo.srcObject = localStream;

        socket.emit("join-room", roomId);
    }

    // ───────────────────────────────
    // CREATE PEER
    // ───────────────────────────────

    // ───────────────────────────────
    // CREATE PEER (УЛУЧШЕННЫЙ)
    // ───────────────────────────────

    function createPeer(id) {

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        peers[id] = pc;

        // Добавляем наши локальные треки (камеру и микрофон) в соединение
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // 1. СОЗДАЕМ ПРАВИЛЬНУЮ ОБЕРТКУ ДЛЯ ВЕРСТКИ
        const clientDiv = document.createElement("div");
        clientDiv.className = "client"; // Тот самый класс из твоего CSS
        clientDiv.id = "wrapper-" + id;

        const label = document.createElement("label");
        label.innerText = "Собеседник";
        clientDiv.appendChild(label);

        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        // video.muted = true; // РАСКОММЕНТИРУЙ для теста, если браузер всё равно блокирует звук
        video.id = id;

        clientDiv.appendChild(video);
        container.appendChild(clientDiv);

        // 2. ОБРАБОТКА ПОЛУЧЕННОГО ПОТОКА
        pc.ontrack = (event) => {
            video.srcObject = event.streams[0];

            // Заставляем браузер воспроизвести видео, как только оно загрузится
            video.onloadedmetadata = () => {
                video.play().catch(err => {
                    console.error("Браузер заблокировал автоплей:", err);
                    // Здесь в идеале нужно показывать кнопку "Нажмите, чтобы включить звук"
                });
            };
        };

        // 3. ОТПРАВКА ICE-КАНДИДАТОВ
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("candidate", {
                    to: id,
                    candidate: event.candidate
                });
            }
        };

        // 4. ЛОГИРОВАНИЕ СТАТУСА СЕТИ (ОЧЕНЬ ВАЖНО)
        pc.oniceconnectionstatechange = () => {
            console.log(`Статус соединения с ${id}:`, pc.iceConnectionState);
        };

        return pc;
    }

    // ───────────────────────────────
    // USERS LIST
    // ───────────────────────────────

    socket.on("users", (users) => {

        if (!streamReady) return;

        users.forEach(id => {

            if (id === socket.id) return;
            if (peers[id]) return;

            const pc = createPeer(id);

            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
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

        // flush ICE
        if (pendingCandidates[from]) {
            for (const c of pendingCandidates[from]) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            pendingCandidates[from] = [];
        }

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

        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        if (pendingCandidates[from]) {
            for (const c of pendingCandidates[from]) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            pendingCandidates[from] = [];
        }
    });

    // ───────────────────────────────
    // CANDIDATES
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

        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    start();

})();