import { Router } from 'express';
import tenants from './tenants/routes';
import users from './users/routes';
import rbac from './rbac/routes';
import academic from './academic/routes';
import materials from './lms/materials';
import assignments from './lms/assignments';
import questions from './lms/questions';
import quizzes from './lms/quizzes';
import grades from './lms/grades';
import attendance from './attendance/routes';
import communication from './communication/routes';
import dashboard from './dashboard/routes';
import landing from './landing/routes';
import exams from './exams/routes';
import rapor from './rapor/routes';
import analytics from './analytics/routes';
import kesiswaan from './kesiswaan/routes';

/** Authenticated modules mounted under /api/v1 (order matters only for overlapping paths). */
export const modules: { path: string; router: Router }[] = [
  { path: '/tenants', router: tenants },
  { path: '/users', router: users },
  { path: '/rbac', router: rbac },
  { path: '/academic', router: academic },
  { path: '/materials', router: materials },
  { path: '/assignments', router: assignments },
  { path: '/questions', router: questions },
  { path: '/quizzes', router: quizzes },
  { path: '/grades', router: grades },
  { path: '/attendance', router: attendance },
  { path: '/communication', router: communication },
  { path: '/dashboard', router: dashboard },
  { path: '/landing', router: landing },
  { path: '/exams', router: exams },
  { path: '/rapor', router: rapor },
  { path: '/analytics', router: analytics },
  { path: '/kesiswaan', router: kesiswaan },
];
