import React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuthStore } from "@/stores/useAuthStore"
import { useNavigate } from "react-router"

const signinSchema = z.object({
  username: z.string().min(1, "Tên đăng nhập không được để trống"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
})

type SigninFormValues = z.infer<typeof signinSchema>

export function SigninForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signin } = useAuthStore();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SigninFormValues>({
    resolver: zodResolver(signinSchema),
  })

  const onSubmit = async (data: SigninFormValues) => {
    const { username, password } = data; 
    await signin(username, password);
    navigate("/"); //chuyển hướng đến trang chủ sau khi đăng nhập thành công
    // TODO: gọi API backend
    
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">

          <form className="p-6 md:p-12" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6">

              {/* logo + tiêu đề */}
              <div className="flex flex-col items-center text-center gap-2">
                <a href="/" className="mx-auto block w-fit text-center">
                  <img src="logo.svg" alt="Logo" />
                </a>
                <h1 className="text-2xl font-bold">Đăng nhập</h1>
                <p className="text-muted-foreground text-balance">
                  Chào mừng bạn quay trở lại, hãy đăng nhập để tiếp tục
                </p>
              </div>

              {/* username */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Tên đăng nhập</Label>
                <Input
                  type="text"
                  id="username"
                  placeholder="Tên đăng nhập"
                  {...register("username")}
                />
                {errors.username && (
                  <p className="text-sm text-destructive">{errors.username.message}</p>
                )}
              </div>

              {/* password */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <a
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Quên mật khẩu?
                  </a>
                </div>
                <Input
                  type="password"
                  id="password"
                  placeholder="Mật khẩu"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
              </div>

              {/* nút đăng nhập */}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>

              <div className="text-center text-sm">
                Chưa có tài khoản?{" "}
                <a href="/signup" className="underline underline-offset-4">
                  Tạo tài khoản
                </a>
              </div>

            </div>
          </form>

          {/* ảnh bên phải */}
          <div className="relative hidden bg-muted md:block">
            <img
              src="/placeholder.png"
              alt="Image"
              className="absolute top-1/2 -translate-y-1/2 object-cover"
            />
          </div>

        </CardContent>
      </Card>
    </div>
  )
}