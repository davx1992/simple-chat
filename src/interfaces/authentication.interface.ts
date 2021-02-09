export interface User {
    id: string;
    last_login: string;
    last_login_timestamp: number;
    socketId: string;
    state: UserState;
}

export enum UserState {
    ACTIVE = "Active",
    INACTIVE = "Inactive",
}
