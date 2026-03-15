import { Router } from 'express';
import { 
  getMyNotifications, 
  getUnreadCount, 
  markAsRead, 
  markAllAsRead, 
  deleteNotification 
} from '../controllers/notification.controller.js';
import auth from '../middlewares/auth.js';

const router = Router();

// All notification routes require authentication
router.use(auth);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/:id/read', markAsRead);
router.patch('/mark-all-read', markAllAsRead);
router.delete('/:id', deleteNotification);

export default router;
