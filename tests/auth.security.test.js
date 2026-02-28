import https from 'http';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 5000;
const URL = `http://localhost:${PORT}/api`;

const makeRequest = (endpoint, method = 'GET', data = null, token = null) => {
    return new Promise((resolve, reject) => {
        const fetchUrl = `${URL}${endpoint}`;
        fetch(fetchUrl, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: data ? JSON.stringify(data) : undefined
        })
            .then(async res => {
                const body = await res.json();
                resolve({ status: res.status, ok: res.ok, body });
            })
            .catch(reject);
    });
};

const runDay5Tests = async () => {
    console.log('--- STARTING DAY 5 AUTHENTICATION & SECURITY TESTS ---\n');

    try {
        console.log('1. Testing Unauthorized Access (No Token)');
        const noTokenRes = await makeRequest('/auth/me', 'GET');
        console.log(`EXPECTED: 401 | ACTUAL: ${noTokenRes.status}`);
        if (noTokenRes.status === 401) {
            console.log('✅ Unauthorized access correctly blocked.\n');
        } else {
            console.log('❌ Failed: Unauthorized access not blocked correctly.\n');
        }

        console.log('2. Testing Invalid Token Rejection');
        const invalidTokenRes = await makeRequest('/auth/me', 'GET', null, 'eyJhbGc...invalid_token_format_here');
        console.log(`EXPECTED: 401 | ACTUAL: ${invalidTokenRes.status}`);
        if (invalidTokenRes.body.message === 'Invalid token.') {
            console.log('✅ Forged token correctly identified and rejected.\n');
        } else {
            console.log('❌ Failed: Forged/invalid token handling failed.\n');
        }

        console.log('3. Proceeding to Role Tests (Needs active users)...');
        // Registering a test candidate
        const candidateLoginRes = await makeRequest('/auth/login', 'POST', {
            email: 'candidate@test.com',
            password: 'Password123!'
        });

        if (candidateLoginRes.ok && candidateLoginRes.body.data?.accessToken) {
            console.log('✅ Successfully authenticated as a Candidate via token. Proceeding to RBAC test...');
            const candToken = candidateLoginRes.body.data.accessToken;

            // Attempting accessing a recruiter-only endpoint
            const rbacRes = await makeRequest('/admin/recruiters', 'GET', null, candToken);
            console.log(`EXPECTED: 403 (Forbidden) | ACTUAL: ${rbacRes.status}`);
            if (rbacRes.status === 403) {
                console.log('✅ RBAC successfully prevented candidate from hitting an admin/recruiter endpoint.\n');
            } else {
                console.log('❌ Failed: RBAC permitted Candidate access where they should be banned.\n');
            }

            console.log('All tests finished.');
        } else {
            console.log('\nSeed users missing. Please run `node adminTools.js seedTestUsers` to populate the DB, then run this file again to complete Role Tests!');
            console.log(`Initial auth APIs gave: ${candidateLoginRes.status} (Are you running the server?)\n`);
        }
    } catch (err) {
        console.error('Testing script crashed. Is the server running (npm run dev)? Error:', err.message);
    }
};

runDay5Tests();
