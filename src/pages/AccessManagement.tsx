import { useState } from 'react';
import { Check, X } from 'lucide-react';

const mockRequests = [
  { id: 1, name: 'Tech Gadgets Store', email: 'contact@techstore.com', date: '2023-10-25' },
  { id: 2, name: 'Fresh Foods Market', email: 'hello@freshfoods.net', date: '2023-10-26' },
  { id: 3, name: 'Urban Apparel', email: 'support@urbanapparel.co', date: '2023-10-27' },
];

const AccessManagement = () => {
  const [requests, setRequests] = useState(mockRequests);

  const handleApprove = (id: number) => {
    console.log(`Approved merchant ${id}`);
    setRequests(requests.filter((req) => req.id !== id));
  };

  const handleReject = (id: number) => {
    console.log(`Rejected merchant ${id}`);
    setRequests(requests.filter((req) => req.id !== id));
  };

  return (
    <div>
      <h1 className="page-title">Merchant Access Management</h1>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
          Pending Requests
        </h2>

        {requests.length === 0 ? (
          <p style={{ color: '#6b7280', padding: '2rem 0', textAlign: 'center' }}>
            No pending requests at the moment.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Merchant Name</th>
                  <th>Email</th>
                  <th>Date Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td style={{ fontWeight: 500 }}>{request.name}</td>
                    <td>{request.email}</td>
                    <td>{request.date}</td>
                    <td>
                      <div className="action-group">
                        <button
                          type="button"
                          onClick={() => handleApprove(request.id)}
                          className="tap-button approve"
                        >
                          <Check size={18} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(request.id)}
                          className="tap-button reject"
                        >
                          <X size={18} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccessManagement;
