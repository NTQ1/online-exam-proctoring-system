//lấy thông tin user hiện tại
export const authMe = async (req, res) => {
    try {

        res.status(200).json({
            success: true,
            user: req.user
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: 'Lỗi server'
        });
    }
}