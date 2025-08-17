export interface TestUser {
  id: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  email: string;
}

export const generateTestUsers = (count: number): TestUser[] => {
  const users: TestUser[] = [];
  for (let i = 1; i <= count; i++) {
    users.push({
      id: `test_user_${i}`,
      username: `testuser${i}`,
      displayName: `Test User ${i}`,
      profileImageUrl: `https://static-cdn.jtvnw.net/jtv_user_pictures/test_user_${i}.png`,
      email: `testuser${i}@test.com`,
    });
  }
  return users;
};

export const TEST_USERS = generateTestUsers(10);