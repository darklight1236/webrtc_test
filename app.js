(() => {

    const localVideo = document.getElementById("local");
    const remoteVideo = document.getElementById("remote");

    const socket = io();

    const peer = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302"
            }
        ]
    });

    async function start() {

        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = stream;

        stream.getTracks().forEach(track => {
            peer.addTrack(track, stream);
        });

    }

    peer.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };

    peer.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("candidate", event.candidate);
        }
    };

    socket.on("candidate", async candidate => {
        await peer.addIceCandidate(candidate);
    });

    socket.on("offer", async offer => {

        await peer.setRemoteDescription(offer);

        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        socket.emit("answer", answer);

    });

    socket.on("answer", async answer => {
        await peer.setRemoteDescription(answer);
    });

    start();

    window.call = async () => {

        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("offer", offer);

    };

})();