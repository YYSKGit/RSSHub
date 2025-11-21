import { Route } from '@/types';
import { handler } from './common';

export const route: Route = {
    path: '/search/:search',
    handler,
};
