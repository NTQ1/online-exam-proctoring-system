import { SigninForm } from '@/components/auth/signin-form'
import React from 'react'

const signinpage = () => {
  return (
    <div className="min-h-screen w-full relative">
  {/* Radial Gradient Background from Top */}
  <div
    className="absolute inset-0 z-0"
    style={{
      background: "radial-gradient(125% 125% at 50% 10%, #fff 40%, #7c3aed 100%)",
    }}
  />
  {/* Your Content/Components */}
   <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full  md:max-w-4xl">
          <SigninForm />
        </div>
      </div>
</div>
    
  )
}

export default signinpage


