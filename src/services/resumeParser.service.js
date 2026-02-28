import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';

const KNOWN_SKILLS = [
    'java', 'javascript', 'python', 'c++', 'react', 'node.js', 'express', 'mongodb',
    'mysql', 'postgresql', 'aws', 'docker', 'git', 'html', 'css', 'angular', 'vue',
    'typescript', 'php', 'laravel', 'ruby', 'go', 'spring', 'django', 'pandas'
];

export const extractTextFromFile = async (buffer, mimetype) => {
    try {
        if (mimetype === 'application/pdf') {
            const data = await pdfParse(buffer);
            return data.text;
        } else if (
            mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimetype === 'application/msword'
        ) {
            const data = await mammoth.extractRawText({ buffer: buffer });
            return data.value;
        } else {
            throw new Error('Unsupported file format for text extraction');
        }
    } catch (err) {
        throw new Error('Could not parse document: ' + err.message);
    }
};

const extractDate = (text) => {
    // Attempt to parse out a single date.
    // E.g., "May 2025" -> Date objects
    if (!text) return null;
    try {
        const parts = text.split(/to|-/i);
        const startRaw = parts[0] ? parts[0].trim() : text;
        const d = new Date(startRaw);
        if (isNaN(d.getTime())) return new Date('2020-01-01');
        return d;
    } catch {
        return new Date('2020-01-01');
    }
};

const extractEndDate = (text) => {
    if (!text) return null;
    try {
        const parts = text.split(/to|-/i);
        if (parts.length > 1) {
            const endRaw = parts[1].trim();
            if (/present|now|current/i.test(endRaw)) return null;
            const d = new Date(endRaw);
            if (isNaN(d.getTime())) return null;
            return d;
        }
        return null;
    } catch {
        return null;
    }
};

const isCurrentCheck = (text) => {
    if (!text) return false;
    return /present|now|current/i.test(text);
};

export const parseResumeToProfile = (rawText) => {
    const text = rawText.replace(/\r/g, '\n');

    // 1. Extract Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0].toLowerCase() : '';

    // 2. Extract Phone
    const phoneMatch = text.match(/(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0].trim() : '';

    // 3. Extract Name
    const linesRaw = text.split('\n').map(l => l.trim());
    const lines = linesRaw.filter(l => l.length > 0);

    let firstName = '';
    let lastName = '';

    if (lines.length > 0) {
        const possibleName = lines[0].replace(/[^a-zA-Z\s]/g, '').trim().split(' ');
        if (possibleName.length >= 2) {
            firstName = possibleName[0];
            lastName = possibleName.slice(1).join(' ');
        } else {
            firstName = possibleName[0];
        }
    }

    // 4. Extract Skills
    const foundSkills = new Set();
    const lowerText = text.toLowerCase();

    KNOWN_SKILLS.forEach(skill => {
        const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (regex.test(lowerText)) {
            foundSkills.add(skill.charAt(0).toUpperCase() + skill.slice(1));
        }
    });

    // 5. Section Extraction (Chunked Heuristic)
    const sections = { summary: [], experience: [], education: [], projects: [] };
    let currentSection = null;
    let currentBlock = -1;

    linesRaw.forEach(line => {
        if (!line) {
            if (currentSection && currentBlock >= 0) currentBlock++;
            return;
        }

        const wordCount = line.split(' ').length;
        if (wordCount <= 4) {
            if (/^(SUMMARY|PROFILE|OBJECTIVE|ABOUT ME)$/i.test(line)) { currentSection = 'summary'; currentBlock = 0; return; }
            if (/^(EXPERIENCE|EMPLOYMENT|WORK HISTORY|PROFESSIONAL EXPERIENCE)$/i.test(line)) { currentSection = 'experience'; currentBlock = 0; return; }
            if (/^(EDUCATION|ACADEMICS|QUALIFICATIONS|ACADEMIC BACKGROUND)$/i.test(line)) { currentSection = 'education'; currentBlock = 0; return; }
            if (/^(PROJECTS|PERSONAL PROJECTS|ACADEMIC PROJECTS)$/i.test(line)) { currentSection = 'projects'; currentBlock = 0; return; }
            if (/^(SKILLS|CERTIFICATIONS|ACTIVITIES|HOBBIES|LANGUAGES|ACHIEVEMENTS)$/i.test(line)) { currentSection = 'others'; currentBlock = -1; return; }
        }

        if (currentSection && currentSection !== 'others' && currentBlock >= 0) {
            if (!sections[currentSection][currentBlock]) sections[currentSection][currentBlock] = [];
            sections[currentSection][currentBlock].push(line);
        }
    });

    // Handle Summary
    const flatSummary = sections.summary.flat().join(' ');
    let summaryText = flatSummary.substring(0, 1000).trim();
    if (!summaryText && lines.length > 3) {
        summaryText = lines.slice(1, 4).join(' ').substring(0, 1000).trim();
    }

    // Handle Experience
    // Expects: company, role, startDate, endDate, isCurrent, description
    const experienceData = sections.experience
        .filter(b => b && b.length > 0)
        .map(block => {
            let companyStr = block[0] || 'Unknown Company';
            let company = companyStr;
            let durationStr = '';

            const dateStrRegex = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(?:\d{1,2},?)?\s*(?:20\d{2}|19\d{2})\s*(?:-|to)\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(?:\d{1,2},?)?\s*(?:20\d{2}|19\d{2})|present|now))/i;
            const match = companyStr.match(dateStrRegex);
            if (match && match.index > 0) {
                durationStr = match[0].trim();
                company = companyStr.replace(match[0], '').trim();
            }

            let role = '';
            let descLines = [];
            for (let i = 1; i < block.length; i++) {
                if (!role && !/\b(20\d{2}|19\d{2}|present|now)\b/i.test(block[i])) { role = block[i]; }
                else if (!durationStr && /\b(20\d{2}|19\d{2}|present|now)\b/i.test(block[i])) { durationStr = block[i]; }
                else { descLines.push(block[i]); }
            }

            return {
                company: company.replace(/(experience|employment|work history)$/i, '').trim(),
                role: role || 'Professional Role',
                startDate: extractDate(durationStr),
                endDate: extractEndDate(durationStr),
                isCurrent: isCurrentCheck(durationStr),
                description: descLines.join('\n').replace(/^\W+/, '').substring(0, 800)
            };
        });

    // Handle Education
    // Expects: institution, degree, fieldOfStudy, startDate, endDate, grade
    const educationData = sections.education
        .filter(b => b && b.length > 0)
        .map(block => {
            let institution = (block[0] || 'Unknown Institution').replace(/(Exper)$/i, '').trim();
            let degree = 'Degree';
            let fieldOfStudy = '';
            let durationStr = '';
            let extra = [];
            for (let i = 1; i < block.length; i++) {
                if (!durationStr && /\b(20\d{2}|19\d{2})\b/.test(block[i])) { durationStr = block[i]; }
                else if (degree === 'Degree') { degree = block[i]; }
                else if (!fieldOfStudy && !/^(SKILLS|TECHNICAL)/i.test(block[i])) { fieldOfStudy = block[i]; }
                else if (/^(SKILLS|TECHNICAL)/i.test(block[i])) { break; }
                else { extra.push(block[i]); }
            }
            return {
                institution,
                degree: degree || 'Unknown Degree',
                fieldOfStudy,
                startDate: extractDate(durationStr),
                endDate: extractEndDate(durationStr),
                grade: ''
            };
        });

    // Handle Projects
    // Expects: title, description, technologies, projectUrl, startDate, endDate
    const projectsData = sections.projects
        .filter(b => b && b.length > 0)
        .map(block => {
            let titleStr = block[0] || 'Featured Project';
            let title = titleStr;
            let projectUrl = '';

            const linkParts = titleStr.split('|').filter(p => p.trim() !== '');
            if (linkParts.length > 1) {
                title = linkParts[0].trim();
                projectUrl = linkParts.slice(1).join(', ').replace(/(link|url|github)/i, '$1').trim();
            }

            let descLines = [];
            for (let i = 1; i < block.length; i++) {
                if (!projectUrl && /(http|www|github|bitbucket|gitlab)/i.test(block[i])) { projectUrl = block[i]; }
                else { descLines.push(block[i]); }
            }
            return {
                title,
                description: descLines.join('\n').replace(/^\W+/, '').substring(0, 800),
                technologies: [],
                projectUrl,
                startDate: null,
                endDate: null
            };
        });

    return {
        firstName,
        lastName,
        email,
        phone,
        summary: summaryText,
        skills: Array.from(foundSkills),
        experience: experienceData,
        education: educationData,
        projects: projectsData
    };
};
