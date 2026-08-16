const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
let otpStorage = {};

const resend = new Resend(process.env.RESEND_API_KEY);

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        // Khởi tạo sẵn tài khoản Admin/Pro mặc định cho bạn
        const defaultAdmin = [{
            username: "admin",
            email: "admin@audiopoolpro.io.vn",
            password: "Admin@123",
            role: "admin",
            package: "pro_lifetime",
            expireDate: null
        }];
        saveUsers(defaultAdmin);
        return defaultAdmin;
    }
    try { 
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); 
    } catch (err) { 
        return []; 
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// 1. API Gửi OTP Đăng ký
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập email!' });

        const usersDB = loadUsers();
        if (usersDB.find(u => u.email === email)) {
            return res.status(400).json({ success: false, message: 'Email đã tồn tại trong hệ thống!' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStorage[email] = { otp, expiresAt: Date.now() + 2 * 60 * 1000 };

        const { error } = await resend.emails.send({
            from: 'AUDIO POOL PRO <support@audiopoolpro.io.vn>',
            to: [email],
            subject: 'Mã xác thực OTP đăng ký',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #7c3aed;">Xác thực tài khoản</h2>
                    <p>Mã OTP của bạn là: <strong style="font-size: 22px; color: #10b981;">${otp}</strong></p>
                    <p>Hiệu lực trong vòng 2 phút.</p>
                   </div>`
        });

        if (error) return res.status(400).json({ success: false, message: error.message });
        res.json({ success: true, message: 'Đã gửi mã OTP thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. API Gửi OTP Quên Mật Khẩu
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập email!' });

        const usersDB = loadUsers();
        const user = usersDB.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ success: false, message: 'Email này chưa được đăng ký trong hệ thống!' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStorage[email] = { otp, expiresAt: Date.now() + 2 * 60 * 1000 };

        const { error } = await resend.emails.send({
            from: 'AUDIO POOL PRO <support@audiopoolpro.io.vn>',
            to: [email],
            subject: 'Mã OTP khôi phục mật khẩu',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #f59e0b;">Khôi phục mật khẩu</h2>
                    <p>Mã OTP của bạn là: <strong style="font-size: 22px; color: #10b981;">${otp}</strong></p>
                    <p>Hiệu lực trong vòng 2 phút.</p>
                   </div>`
        });

        if (error) return res.status(400).json({ success: false, message: error.message });
        res.json({ success: true, message: 'Đã gửi mã OTP khôi phục về email!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. API Đăng ký tài khoản (Kiểm tra độ mạnh mật khẩu)
app.post('/api/register', (req, res) => {
    const { email, otp, username, password } = req.body;
    const record = otpStorage[email];

    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
        return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
    }

    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự, gồm chữ, số và ký tự đặc biệt (VD: abc123@)!' });
    }

    const usersDB = loadUsers();
    if (usersDB.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Email đã tồn tại!' });
    if (usersDB.find(u => u.username === username)) return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại!' });

    usersDB.push({ username, email, password, role: 'user', package: 'free', expireDate: null });
    saveUsers(usersDB);
    delete otpStorage[email];
    
    res.json({ success: true, message: 'Đăng ký thành công!' });
});

// 4. API Đăng nhập
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const usersDB = loadUsers();
    const user = usersDB.find(u => (u.username === username || u.email === username) && u.password === password);
    
    if (!user) return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    
    res.json({ 
        success: true, 
        username: user.username, 
        role: user.role, 
        package: user.package,
        message: 'Đăng nhập thành công!' 
    });
});

// 5. API Đổi mật khẩu mới (Chặn trùng mật khẩu cũ & kiểm tra ký tự đặc biệt)
app.post('/api/reset-password', (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const record = otpStorage[email];

        if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
        }

        const usersDB = loadUsers();
        const user = usersDB.find(u => u.email === email);
        if (!user) return res.status(400).json({ success: false, message: 'Không tìm thấy tài khoản!' });

        if (user.password === newPassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới không được trùng với mật khẩu cũ!' });
        }

        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự, gồm chữ, số và ký tự đặc biệt (VD: abc123@)!' });
        }

        user.password = newPassword;
        saveUsers(usersDB);
        delete otpStorage[email];

        res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 6. API Admin lấy danh sách người dùng
app.get('/api/admin/users', (req, res) => {
    res.json({ success: true, users: loadUsers() });
});

// 7. API Admin kích hoạt Pro từ xa
app.post('/api/admin/upgrade-pro', (req, res) => {
    const { username } = req.body;
    const usersDB = loadUsers();
    const user = usersDB.find(u => u.username === username);

    if (!user) return res.status(400).json({ success: false, message: 'Không tìm thấy người dùng!' });

    user.package = 'pro_lifetime';
    saveUsers(usersDB);

    res.json({ success: true, message: `Đã kích hoạt bản Pro thành công cho tài khoản: ${username}!` });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server đang chạy trên port ${PORT}`));