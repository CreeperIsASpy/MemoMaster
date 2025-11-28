const fs = require('fs');

const exePath = process.argv[2];

if (!exePath) {
    console.log('请指定 exe 文件路径，例如: node patch.js MemoMaster.exe');
    process.exit(1);
}

try {
    const buffer = fs.readFileSync(exePath);
    
    // 1. 读取 PE 头的位置 (位于文件开头 0x3C 处)
    const peHeaderOffset = buffer.readUInt32LE(0x3C);
    
    // 2. 计算 Subsystem 标志位的偏移量
    // PE签名(4) + COFF头(20) + OptionalHeader中Subsystem的偏移(68) = 92 (0x5C)
    const subsystemOffset = peHeaderOffset + 92;
    
    // 3. 读取当前 Subsystem 值
    const subsystem = buffer.readUInt16LE(subsystemOffset);
    
    if (subsystem === 3) { // 3 代表 Console (黑框)
        console.log(`检测到控制台程序 (Subsystem: 3)`);
        // 4. 修改为 2 (Windows GUI, 无黑框)
        buffer.writeUInt16LE(2, subsystemOffset);
        fs.writeFileSync(exePath, buffer);
        console.log('>>> 成功！已去除黑框，变身为纯 GUI 程序。');
    } else if (subsystem === 2) {
        console.log('该程序已经是 GUI 程序了，无需修改。');
    } else {
        console.log(`未知的 Subsystem 类型: ${subsystem}，未做修改。`);
    }
} catch (err) {
    console.error('修改失败:', err.message);
}