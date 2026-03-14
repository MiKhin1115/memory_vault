const mockOrders = [
  { id: 'ORD-001', customer: 'John Doe', merchant: 'Tech Gadgets Store', amount: '$129.99', status: 'Delivered', date: '2023-10-27' },
  { id: 'ORD-002', customer: 'Jane Smith', merchant: 'Urban Apparel', amount: '$45.00', status: 'Processing', date: '2023-10-27' },
  { id: 'ORD-003', customer: 'Bob Johnson', merchant: 'Fresh Foods Market', amount: '$85.50', status: 'Shipped', date: '2023-10-26' },
  { id: 'ORD-004', customer: 'Alice Brown', merchant: 'Tech Gadgets Store', amount: '$599.00', status: 'Pending', date: '2023-10-26' },
  { id: 'ORD-005', customer: 'Charlie Davis', merchant: 'Urban Apparel', amount: '$120.00', status: 'Delivered', date: '2023-10-25' },
];

const statusStyles: Record<string, { backgroundColor: string; color: string }> = {
  Delivered: { backgroundColor: '#d1fae5', color: '#065f46' },
  Processing: { backgroundColor: '#dbeafe', color: '#1e40af' },
  Shipped: { backgroundColor: '#fef3c7', color: '#92400e' },
  Pending: { backgroundColor: '#f3f4f6', color: '#374151' },
};

const Orders = () => {
  return (
    <div>
      <h1 className="page-title">Orders Information</h1>

      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Recent Orders</h2>
          <input type="text" placeholder="Search orders..." className="text-input" />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {mockOrders.map((order) => {
                const badgeStyle = statusStyles[order.status] ?? statusStyles.Pending;

                return (
                  <tr key={order.id}>
                    <td style={{ fontWeight: 500, color: '#3b82f6' }}>{order.id}</td>
                    <td>{order.customer}</td>
                    <td>{order.merchant}</td>
                    <td style={{ fontWeight: 500 }}>{order.amount}</td>
                    <td>
                      <span className="status-badge" style={badgeStyle}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ color: '#6b7280', fontSize: '0.875rem' }}>{order.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Orders;
