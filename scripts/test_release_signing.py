import unittest
from publishVerifiedRelease import require_signed_jobs


class PublisherTrustTests(unittest.TestCase):
    def jobs(self):
        return [{'name': name, 'steps': [{'name': 'Verify signed release artifacts', 'conclusion': 'success'}]}
                for name in ['installer (windows-2022, win, nsis, x64)',
                             'installer (macos-15-intel, mac, dmg zip, x64)',
                             'installer (macos-15, mac, dmg zip, arm64)']]

    def test_signed_matrix_accepted(self):
        require_signed_jobs(self.jobs())

    def test_unsigned_old_builds_rejected(self):
        jobs = self.jobs()
        jobs[0]['steps'] = []
        with self.assertRaises(ValueError):
            require_signed_jobs(jobs)

    def test_skipped_failed_or_cancelled_verification_rejected(self):
        for state in ['skipped', 'failure', 'cancelled']:
            jobs = self.jobs()
            jobs[1]['steps'][0]['conclusion'] = state
            with self.assertRaises(ValueError):
                require_signed_jobs(jobs)

    def test_incomplete_matrix_rejected(self):
        with self.assertRaises(ValueError):
            require_signed_jobs(self.jobs()[:2])


if __name__ == '__main__':
    unittest.main()
