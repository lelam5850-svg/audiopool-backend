const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json());

// Kết nối MongoDB Atlas (Đọc từ biến môi trường MONGO_URI trên Render)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://<username>:<password>@cluster.mongodb.net/audiopool?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Đã kết nối thành công với MongoDB Atlas!'))
    .catch(err => console.log('❌ Lỗi kết nối MongoDB:', err));

// Định nghĩa Schema người dùng
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' }, // 'admin' hoặc 'user'
    package: { type: String, default: 'free' }, // 'free' hoặc 'pro_lifetime'
    expireDate: { type: Date, default: null }
});

const User = mongoose.model('User', userSchema);

let otpStorage = {};
const resend = new Resend(process.env.RESEND_API_KEY);

// Khởi tạo tài khoản Admin mặc định nếu chưa có trên Database
async function initAdmin() {
    try {
        const adminExist = await User.findOne({ role: 'admin' });
        if (!adminExist) {
            await User.create({
                username: "admin",
                email: "admin@audiopoolpro.io.vn",
                password: "Admin@123",
                role: "admin",
                package: "pro_lifetime"
            });
            console.log('👑 Đã khởi tạo tài khoản Admin mặc định thành công!');
        }
    } catch (e) {
        console.log('Lỗi tạo admin:', e);
    }
}
initAdmin();

// 1. API Gửi OTP Đăng ký
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập email!' });

        const userExist = await User.findOne({ email });
        if (userExist) {
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

        const user = await User.findOne({ email });
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

// 3. API Đăng ký tài khoản
app.post('/api/register', async (req, res) => {
    try {
        const { email, otp, username, password } = req.body;
        const record = otpStorage[email];

        if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
        }

        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự, gồm chữ, số và ký tự đặc biệt (VD: abc123@)!' });
        }

        const emailExist = await User.findOne({ email });
        if (emailExist) return res.status(400).json({ success: false, message: 'Email đã tồn tại!' });

        const userExist = await User.findOne({ username });
        if (userExist) return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại!' });

        await User.create({
            username,
            email,
            password,
            role: 'user',
            package: 'free'
        });

        delete otpStorage[email];
        res.json({ success: true, message: 'Đăng ký thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. API Đăng nhập
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ 
            $or: [{ username: username }, { email: username }],
            password: password 
        });
        
        if (!user) return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
        
        res.json({ 
            success: true, 
            username: user.username, 
            role: user.role, 
            package: user.package,
            message: 'Đăng nhập thành công!' 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. API Đổi mật khẩu mới
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const record = otpStorage[email];

        if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: 'Không tìm thấy tài khoản!' });

        if (user.password === newPassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới không được trùng với mật khẩu cũ!' });
        }

        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự, gồm chữ, số và ký tự đặc biệt (VD: abc123@)!' });
        }

        user.password = newPassword;
        await user.save();
        delete otpStorage[email];

        res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 6. API Admin lấy danh sách người dùng từ Database
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}, { password: 0 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 7. API Admin kích hoạt Pro từ xa
app.post('/api/admin/upgrade-pro', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });

        if (!user) return res.status(400).json({ success: false, message: 'Không tìm thấy người dùng!' });

        user.package = 'pro_lifetime';
        await user.save();

        res.json({ success: true, message: `Đã kích hoạt bản Pro thành công cho tài khoản: ${username}!` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server đang chạy trên port ${PORT}`));