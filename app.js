(() => {

    const localVideo = document.getElementById("local");
    const remoteVideo = document.getElementById("remote");

    const roomId = "test-room";
    const socket = io();

    let peer;
    let localStream;
    let isCaller = false;

    function createPeer() {

        const pc = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.l.google.com:19302"
                },
                {
                    urls: "turn:82.26.150.172:3478",
                    username: "test",
                    credential: "test123"
                }
            ]
        });

        pc.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("candidate", {
                    candidate: event.candidate,
                    roomId
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log("CONNECTION:", pc.connectionState);
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE:", pc.iceConnectionState);
        };

        return pc;
    }

    async function start() {

        peer = createPeer();

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });

        socket.emit("join", roomId);

        setupSocket();
    }

    function setupSocket() {

        socket.on("role", async (role) => {

            isCaller = role === "caller";

            console.log("ROLE:", role);

            if (isCaller) {
                createOffer();
            }
        });

        socket.on("user-joined", () => {
            console.log("USER JOINED");
        });

        socket.on("offer", async (offer) => {

            console.log("GOT OFFER");

            await peer.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            socket.emit("answer", {
                answer,
                roomId
            });
        });

        socket.on("answer", async (answer) => {

            console.log("GOT ANSWER");

            await peer.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on("candidate", async (candidate) => {

            try {
                await peer.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error(e);
            }
        });
    }

    async function createOffer() {

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit("offer", {
            offer,
            roomId
        });
    }

    start();

})();