# Smart Spend

## Installation

1. Clone the repository:
```
git clone https://github.com/MyatBhoneThet/senior-project-backend.git
```
2. Install dependencies:
```
cd backend
npm install
```
3. Set up environment variables:
   - Create a `.env` file in the root directory of the project.
   - Add the necessary environment variables, such as `MONGO_URI`, `GITHUB_TOKEN`, `OPENAI_API_KEY`, etc.

## Usage

1. Start the server:
```
npm start
```
2. The server will be running at `http://localhost:8000`.

## API

The project provides the following API endpoints:

### Authentication
- `POST /api/v1/auth/register`: Register a new user.
- `POST /api/v1/auth/login`: Log in a user.
- `POST /api/v1/auth/google`: Authenticate with Google.
- `GET /api/v1/auth/me`: Get the current user's information.
- `POST /api/v1/auth/change-password`: Change the user's password.
- `DELETE /api/v1/auth/delete-account`: Delete the user's account.

### Expenses
- `POST /api/v1/expense/add`: Add a new expense.
- `GET /api/v1/expense/get`: Get all expenses.
- `DELETE /api/v1/expense/:id`: Delete an expense.
- `GET /api/v1/expense/downloadexcel`: Download expenses as an Excel file.
- `PUT /api/v1/expense/:id`: Update an expense.

### Income
- `POST /api/v1/income/add`: Add a new income.
- `GET /api/v1/income/get`: Get all incomes.
- `DELETE /api/v1/income/:id`: Delete an income.
- `GET /api/v1/income/downloadexcel`: Download incomes as an Excel file.
- `PUT /api/v1/income/:id`: Update an income.

### Categories
- `GET /api/v1/categories`: Get all categories.
- `POST /api/v1/categories`: Create a new category.

### Dashboard
- `GET /api/v1/dashboard`: Get dashboard data.

### Transactions
- `POST /api/v1/transactions`: Create a new transaction.
- `GET /api/v1/transactions`: Get all transactions.
- `GET /api/v1/transactions/:id`: Get a specific transaction.
- `PATCH /api/v1/transactions/:id`: Update a transaction.
- `DELETE /api/v1/transactions/:id`: Delete a transaction.
- `GET /api/v1/transactions/analytics/sum`: Get the sum of transactions.

### Recurring
- `GET /api/v1/recurring`: Get all recurring rules.
- `POST /api/v1/recurring`: Create a new recurring rule.
- `PATCH /api/v1/recurring/:id`: Update a recurring rule.
- `PATCH /api/v1/recurring/:id/toggle`: Toggle a recurring rule.
- `DELETE /api/v1/recurring/:id`: Delete a recurring rule.
- `POST /api/v1/recurring/run`: Manually run the recurrence engine.

### Chat
- `POST /api/v1/chat/send`: Send a chat message and get a response.

### Users
- `GET /api/v1/users/:id`: Get a user's profile.
- `PUT /api/v1/users/:id`: Update a user's profile.
- `DELETE /api/v1/users/:id/photo`: Remove a user's profile photo.
- `POST /api/v1/users/me/photo`: Upload a user's profile photo.
- `PUT /api/v1/users/me/preferences`: Update a user's preferences.
- `GET /api/v1/users/me/preferences`: Get a user's preferences.
- `DELETE /api/v1/users/me`: Delete the current user's account.

## Contributing

1. Fork the repository.
2. Create a new branch: `git checkout -b feature/your-feature`.
3. Make your changes and commit them: `git commit -am 'Add some feature'`.
4. Push to the branch: `git push origin feature/your-feature`.
5. Submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).

## Testing

To run the tests, use the following command:
```
npm test
```
