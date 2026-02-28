import multer from 'multer';

// Use memory storage for resume parsing
const storage = multer.memoryStorage();

export const uploadResumeMemory = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/msword' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and DOC/DOCX files are allowed!'), false);
        }
    }
});
