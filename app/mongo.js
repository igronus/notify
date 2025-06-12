db.notifications.aggregate([
    {
        $group: {
            _id: "$clientId",
            totalNotifications: { $sum: 1 },
            pendingNotifications: {
                $sum: {
                    $cond: [
                        { $eq: ["$status", "PENDING"] },
                        1,
                        0
                    ]
                }
            },
            sentNotifications: {
                $sum: {
                    $cond: [
                        { $eq: ["$status", "SENT"] },
                        1,
                        0
                    ]
                }
            }
        }
    },
    {
        $sort: {
            totalNotifications: -1
        }
    },
    {
        $limit: 10
    },
    {
        $project: {
            _id: 0,
            clientId: "$_id",
            totalNotifications: 1,
            pendingNotifications: 1,
            sentNotifications: 1
        }
    }
]);
