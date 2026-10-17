# ServeConnect REST API reference

All endpoints are under `/api`. Requests and responses are JSON (camelCase) unless noted; uploads use `multipart/form-data`.
Authenticate with `Authorization: Bearer <accessToken>` (returned by every sign-in endpoint). The refresh token lives in an httpOnly cookie and is rotated by `POST /api/auth/refresh`.

Errors look like `{"error": {"code": "bad_request", "message": "…", "details": {"fields": {"email": "…"}}}}`.

Real-time (Socket.IO at `/socket.io`, handshake `auth: { token }`). Server → client: `notification`, `message`, `message:edited`, `message:deleted`, `typing`, `read`, `conversation:updated`, `wishlist:update`, `event:counts`, `checkin`. Client → server: `conversation:join`, `conversation:leave`, `typing`, `watch` (`request:<id>` / `event:<id>`), `unwatch`.

The request/response shape for each route is defined by the zod schema at the top of its handler in `server/src/modules/<module>/routes.ts`.

## auth

| Method | Path |
|---|---|
| GET | `/api/auth/config` |
| POST | `/api/auth/register` |
| POST | `/api/auth/verify` |
| POST | `/api/auth/resend` |
| POST | `/api/auth/login` |
| POST | `/api/auth/otp/request` |
| POST | `/api/auth/otp/verify` |
| POST | `/api/auth/google` |
| POST | `/api/auth/google/complete` |
| POST | `/api/auth/2fa/verify` |
| POST | `/api/auth/refresh` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/sessions` |
| DELETE | `/api/auth/sessions/:id` |
| POST | `/api/auth/sessions/revoke-others` |
| POST | `/api/auth/forgot` |
| POST | `/api/auth/reset` |
| POST | `/api/auth/password/change` |
| POST | `/api/auth/2fa/setup` |
| POST | `/api/auth/2fa/enable` |
| POST | `/api/auth/2fa/disable` |
| POST | `/api/auth/2fa/backup-codes` |
| POST | `/api/auth/contact/email` |
| POST | `/api/auth/contact/email/verify` |
| POST | `/api/auth/contact/phone` |
| POST | `/api/auth/contact/phone/verify` |
| POST | `/api/auth/google/link` |
| POST | `/api/auth/google/unlink` |
| GET | `/api/auth/guardian/:token` |
| POST | `/api/auth/guardian/:token` |
| POST | `/api/auth/guardian-resend` |

## users

| Method | Path |
|---|---|
| GET | `/api/users/me` |
| PATCH | `/api/users/me` |
| PATCH | `/api/users/me/privacy` |
| PATCH | `/api/users/me/donor` |
| PATCH | `/api/users/me/notifications` |
| PATCH | `/api/users/me/leaderboard` |
| POST | `/api/users/me/onboarding-complete` |
| POST | `/api/users/me/:kind` |
| GET | `/api/users/me/export` |
| POST | `/api/users/me/delete` |
| POST | `/api/users/me/company/join` |
| POST | `/api/users/me/company/leave` |
| GET | `/api/users/search` |
| GET | `/api/users/suggestions` |
| GET | `/api/users/:idOrHandle` |
| GET | `/api/users/:id/followers` |
| GET | `/api/users/:id/following` |
| POST | `/api/users/:id/follow` |
| DELETE | `/api/users/:id/follow` |
| POST | `/api/users/:id/block` |
| DELETE | `/api/users/:id/block` |
| GET | `/api/users/:id/events` |
| GET | `/api/users/:id/gallery` |
| GET | `/api/users/:id/reviews` |

## posts

| Method | Path |
|---|---|
| POST | `/api/posts/polls/:id/vote` |
| GET | `/api/posts/feed` |
| GET | `/api/posts/explore` |
| GET | `/api/posts/trending-tags` |
| GET | `/api/posts/user/:id` |
| GET | `/api/posts/bookmarks` |
| GET | `/api/posts/:id` |
| POST | `/api/posts` |
| PATCH | `/api/posts/:id` |
| DELETE | `/api/posts/:id` |
| POST | `/api/posts/:id/like` |
| DELETE | `/api/posts/:id/like` |
| GET | `/api/posts/:id/likes` |
| POST | `/api/posts/:id/bookmark` |
| DELETE | `/api/posts/:id/bookmark` |
| GET | `/api/posts/:id/comments` |
| POST | `/api/posts/:id/comments` |
| DELETE | `/api/posts/comments/:commentId` |

## events

| Method | Path |
|---|---|
| GET | `/api/events` |
| GET | `/api/events/recommended` |
| GET | `/api/events/mine` |
| POST | `/api/events` |
| PATCH | `/api/events/:id` |
| POST | `/api/events/:id/cover` |
| POST | `/api/events/:id/publish` |
| POST | `/api/events/:id/cancel` |
| DELETE | `/api/events/:id` |
| GET | `/api/events/:id` |
| POST | `/api/events/:id/register` |
| POST | `/api/events/:id/cancel-registration` |
| GET | `/api/events/:id/attendees` |
| GET | `/api/events/:id/attendees.csv` |
| PATCH | `/api/events/:id/attendees/:userId` |
| DELETE | `/api/events/:id/attendees/:userId` |
| GET | `/api/events/:id/checkin-qr` |
| POST | `/api/events/:id/checkin` |
| POST | `/api/events/:id/checkin/manual` |
| POST | `/api/events/:id/complete` |
| GET | `/api/events/:id/analytics` |
| GET | `/api/events/:id/gallery` |
| POST | `/api/events/:id/gallery` |
| DELETE | `/api/events/:id/gallery/:photoId` |
| GET | `/api/events/:id/reviews` |
| POST | `/api/events/:id/reviews` |
| GET | `/api/events/:id/discussions` |
| POST | `/api/events/:id/discussions` |
| DELETE | `/api/events/:id/discussions/:did` |
| POST | `/api/events/:id/discussions/:did/pin` |
| GET | `/api/events/:id/polls` |
| POST | `/api/events/:id/polls` |

## teams

| Method | Path |
|---|---|
| GET | `/api/teams/events/:eventId/teams` |
| POST | `/api/teams/events/:eventId/teams` |
| POST | `/api/teams/events/:eventId/teams/auto` |
| PATCH | `/api/teams/:teamId` |
| DELETE | `/api/teams/:teamId` |
| POST | `/api/teams/:teamId/members` |
| PATCH | `/api/teams/:teamId/members/:userId` |
| DELETE | `/api/teams/:teamId/members/:userId` |

## chat

| Method | Path |
|---|---|
| GET | `/api/chat/conversations` |
| GET | `/api/chat/unread-count` |
| POST | `/api/chat/dm/:userId` |
| GET | `/api/chat/conversations/:id` |
| GET | `/api/chat/conversations/:id/messages` |
| POST | `/api/chat/conversations/:id/messages` |
| POST | `/api/chat/conversations/:id/read` |
| POST | `/api/chat/conversations/:id/mute` |
| PATCH | `/api/chat/messages/:id` |
| DELETE | `/api/chat/messages/:id` |

## requests

| Method | Path |
|---|---|
| POST | `/api/requests/blood` |
| GET | `/api/requests/blood` |
| GET | `/api/requests/blood/:id` |
| POST | `/api/requests/blood/:id/respond` |
| DELETE | `/api/requests/blood/:id/respond` |
| PATCH | `/api/requests/blood/:id/responses/:responseId` |
| POST | `/api/requests/blood/:id/status` |
| POST | `/api/requests/resources` |
| POST | `/api/requests/resources/:id/cover` |
| GET | `/api/requests/resources` |
| GET | `/api/requests/resources/:id` |
| PATCH | `/api/requests/resources/:id` |
| POST | `/api/requests/resources/:id/items` |
| PATCH | `/api/requests/resources/:id/items/:itemId` |
| DELETE | `/api/requests/resources/:id/items/:itemId` |
| POST | `/api/requests/resources/:id/pledges` |
| DELETE | `/api/requests/pledges/:pledgeId` |
| PATCH | `/api/requests/pledges/:pledgeId` |
| POST | `/api/requests/resources/:id/status` |
| GET | `/api/requests/mine` |

## notifications

| Method | Path |
|---|---|
| GET | `/api/notifications` |
| GET | `/api/notifications/unread-count` |
| POST | `/api/notifications/read-all` |
| POST | `/api/notifications/:id/read` |
| DELETE | `/api/notifications/:id` |
| GET | `/api/notifications/push/public-key` |
| POST | `/api/notifications/push/subscribe` |
| POST | `/api/notifications/push/unsubscribe` |

## certificates

| Method | Path |
|---|---|
| GET | `/api/certificates/mine` |
| GET | `/api/certificates/verify/:serial` |
| GET | `/api/certificates/:serial/pdf` |

## gamification

| Method | Path |
|---|---|
| GET | `/api/engagement/leaderboard` |
| GET | `/api/engagement/progress` |

## verification

| Method | Path |
|---|---|
| GET | `/api/verification/me` |
| POST | `/api/verification` |

## reports

| Method | Path |
|---|---|
| POST | `/api/reports` |

## admin

| Method | Path |
|---|---|
| GET | `/api/admin/stats` |
| GET | `/api/admin/verifications` |
| GET | `/api/admin/verifications/:id/documents/:index` |
| POST | `/api/admin/verifications/:id/decide` |
| POST | `/api/admin/users/:id/verification` |
| GET | `/api/admin/reports` |
| POST | `/api/admin/reports/:id/resolve` |
| GET | `/api/admin/users` |
| POST | `/api/admin/users/:id/suspend` |
| POST | `/api/admin/users/:id/unsuspend` |
| PATCH | `/api/admin/users/:id/role` |
| POST | `/api/admin/users/:id/revoke-sessions` |
| POST | `/api/admin/broadcast` |
| GET | `/api/admin/audit` |
| POST | `/api/admin/purge-documents` |

## csr

| Method | Path |
|---|---|
| GET | `/api/csr/members` |
| POST | `/api/csr/invite-code/rotate` |
| DELETE | `/api/csr/members/:userId` |
| POST | `/api/csr/events/:eventId/bulk-register` |
| GET | `/api/csr/impact` |
| GET | `/api/csr/impact.csv` |

## misc

| Method | Path |
|---|---|
| GET | `/api/health` |
| GET | `/api/geo/search` |
| GET | `/api/geo/reverse` |
| GET | `/api/handbook.pdf` |
| GET | `/api/stats/public` |
| GET | `/api/search` |
