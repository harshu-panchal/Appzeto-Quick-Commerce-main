import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectoryData = fs.statSync(dirPath).isDirectory();
        isDirectoryData ? walkDir(dirPath, callback) : callback(dirPath);
    });
}

const targetDir = 'c:\\Users\\victus\\Desktop\\noyo-kart\\frontend\\src';

walkDir(targetDir, (filePath) => {
    if (filePath.endsWith('.jsx') || filePath.endsWith('.tsx') || filePath.endsWith('.css')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;
        
        // Replace emerald with brand
        content = content.replace(/emerald-/g, 'brand-');
        // Replace green with brand
        content = content.replace(/green-/g, 'brand-');
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated: ${filePath}`);
        }
    }
});

console.log('Finished mass color replacement.');
