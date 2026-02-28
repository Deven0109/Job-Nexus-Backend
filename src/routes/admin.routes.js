import { Router } from 'express';
import {
    getDashboardStats,
    listUsers,
    getUserById,
    createUser,
    updateUser,
    toggleUserStatus,
    deleteUser,
    listEmployers,
    listCandidates,
    listRecruiters,
    getEmployerProfile,
    toggleEmployerVerification,
} from '../controllers/admin.controller.js';
import {
    createUserValidation,
    updateUserValidation,
    listUsersValidation,
} from '../validators/admin.validator.js';
import validate from '../middleware/validate.js';
import auth from '../middleware/auth.js';
import authorize from '../middleware/rbac.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(auth, authorize('admin'));

// ==================== DASHBOARD ====================

// GET /api/admin/dashboard/stats — Dashboard statistics
router.get('/dashboard/stats', getDashboardStats);

// ==================== USER MANAGEMENT ====================

// GET /api/admin/users/all — List all users
router.get('/users/all', listUsersValidation, validate, listUsers);

// GET /api/admin/users/detail/:id — Get single user details
router.get('/users/detail/:id', getUserById);

// POST /api/admin/users/create — Create a new user
router.post('/users/create', createUserValidation, validate, createUser);

// PUT /api/admin/users/update/:id — Update user details
router.put('/users/update/:id', updateUserValidation, validate, updateUser);

// PATCH /api/admin/users/status/:id — Activate/Deactivate user
router.patch('/users/status/:id', toggleUserStatus);

// DELETE /api/admin/users/delete/:id — Permanently delete a user
router.delete('/users/delete/:id', deleteUser);

// ==================== PLURALIZED ROLE MANAGEMENT ====================

// GET /api/admin/roles/employers — List all employer accounts
router.get('/roles/employers', listEmployers);

// GET /api/admin/roles/candidates — List all candidate accounts
router.get('/roles/candidates', listCandidates);

// GET /api/admin/roles/recruiters — List all recruiter accounts
router.get('/roles/recruiters', listRecruiters);

// GET /api/admin/employers/:userId/profile — Get employer company profile
router.get('/employers/:userId/profile', getEmployerProfile);

// PATCH /api/admin/employers/:userId/verify — Toggle employer verification
router.patch('/employers/:userId/verify', toggleEmployerVerification);

export default router;
