import React from 'react'
import { CFooter } from '@coreui/react'
import { PROJECT_NAME } from '../projectName'
import { t } from 'src/i18n'

const AppFooter = () => {
  return (
    <CFooter className="px-4">
      <div>
        <span>{PROJECT_NAME}</span>
        <span className="ms-1">&copy; {new Date().getFullYear()}</span>
      </div>
      {/* a phone - the installation's copyright only (the two texts wrapped on two lines) */}
      <div className="ms-auto d-none d-sm-block">
        {/* the installation's name on the left (PROJECT_NAME), the product's on the right */}
        <span>{t('Powered by {{product}}', { product: 'Nexus Edge' })}</span>
      </div>
    </CFooter>
  )
}

export default React.memo(AppFooter)
